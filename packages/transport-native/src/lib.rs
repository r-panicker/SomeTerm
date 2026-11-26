mod network;
mod serial;
mod telnet;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, oneshot, watch, Mutex};

pub type Result<T> = std::result::Result<T, String>;
pub type Sink = Arc<dyn Fn(Event) + Send + Sync>;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub baud_rate: u32,
    pub data_bits: u8,
    pub stop_bits: f64,
    pub parity: String,
    pub flow_control: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct OutputSignals {
    pub dtr: Option<bool>,
    pub rts: Option<bool>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct InputSignals {
    pub cts: bool,
    pub dsr: bool,
    pub dcd: bool,
    pub ri: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Event {
    Data { path: String, data: Vec<u8> },
    Error { path: String, message: String },
    Notice { path: String, text: String },
    Close { path: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Port {
    path: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    product_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    serial_number: Option<String>,
}

pub fn list_ports() -> Result<Vec<Port>> {
    let mut ports: Vec<Port> = tokio_serial::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| {
            let (vendor_id, product_id, serial_number, detail) = match p.port_type {
                tokio_serial::SerialPortType::UsbPort(u) => (
                    Some(format!("{:04X}", u.vid)),
                    Some(format!("{:04X}", u.pid)),
                    u.serial_number,
                    u.manufacturer,
                ),
                _ => (None, None, None, None),
            };
            let label = match detail {
                Some(d) => format!("{} · {}", p.port_name, d),
                None => p.port_name.clone(),
            };
            Port {
                path: p.port_name,
                label,
                vendor_id,
                product_id,
                serial_number,
            }
        })
        .collect();
    // Enumeration must not prevent manually supplied paths (including PTYs) from appearing.
    if let Some(extra) = std::env::var_os("SOMETERM_EXTRA_PORTS") {
        for path in std::env::split_paths(&extra) {
            let path = path.to_string_lossy().into_owned();
            if !ports.iter().any(|p| p.path == path) {
                ports.push(Port {
                    label: path.clone(),
                    path,
                    vendor_id: None,
                    product_id: None,
                    serial_number: None,
                });
            }
        }
    }
    Ok(ports)
}

pub(crate) fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
type Reply<T> = oneshot::Sender<Result<T>>;
pub(crate) enum Request {
    Write(Vec<u8>, Reply<()>),
    Set(OutputSignals, Reply<()>),
    Get(Reply<InputSignals>),
    Break(u64, Reply<()>),
}

#[derive(Default, Clone)]
pub struct Backend {
    entries: Arc<Mutex<HashMap<String, Arc<Entry>>>>,
}
struct Entry {
    tx: mpsc::Sender<Request>,
    cancel: watch::Sender<bool>,
    done: watch::Sender<bool>,
}

impl Backend {
    pub async fn open(&self, path: String, options: Options, sink: Sink) -> Result<()> {
        let (tx, rx) = mpsc::channel(64);
        let (cancel, mut canceled) = watch::channel(false);
        let (done, _) = watch::channel(false);
        let entry = Arc::new(Entry { tx, cancel, done });
        {
            let mut entries = self.entries.lock().await;
            if entries.contains_key(&path) {
                return Err(format!("{path} is already open"));
            }
            entries.insert(path.clone(), entry.clone());
        }
        // Reserve this path without blocking other connections during DNS/connect.
        let opening = async {
            if path.contains("://") {
                network::Network::open(&path).await.map(Connection::Network)
            } else {
                serial::open(&path, &options).map(Connection::Serial)
            }
        };
        let result = tokio::select! {
            result=opening=>result,
            _=canceled.changed()=>Err("Connection closed while opening".into()),
        };
        let connection = match result {
            Ok(connection) => connection,
            Err(error) => {
                self.entries.lock().await.remove(&path);
                entry.done.send_replace(true);
                return Err(error);
            }
        };
        let entries = self.entries.clone();
        tokio::spawn(async move {
            let running = async {
                match connection {
                    Connection::Serial(port) => serial::run(port, &path, &sink, rx).await,
                    Connection::Network(net) => net.run(&path, &sink, rx).await,
                }
            };
            let is_canceled = *canceled.borrow();
            if is_canceled {
                drop(running);
            } else {
                tokio::select! { _=running=>{}, _=canceled.changed()=>{} }
            }
            let mut entries = entries.lock().await;
            if entries.get(&path).is_some_and(|e| Arc::ptr_eq(e, &entry)) {
                entries.remove(&path);
            }
            // Remove first so an unplug callback may reopen immediately.
            drop(entries);
            entry.done.send_replace(true);
            sink(Event::Close { path });
        });
        Ok(())
    }

    async fn request<T>(&self, path: &str, make: impl FnOnce(Reply<T>) -> Request) -> Result<T> {
        let tx = self
            .entries
            .lock()
            .await
            .get(path)
            .map(|e| e.tx.clone())
            .ok_or_else(|| format!("{path} is not open"))?;
        let (reply, result) = oneshot::channel();
        tx.send(make(reply))
            .await
            .map_err(|_| "Connection closed".to_string())?;
        result.await.map_err(|_| "Connection closed".to_string())?
    }
    pub async fn write(&self, path: &str, data: Vec<u8>) -> Result<()> {
        self.request(path, |r| Request::Write(data, r)).await
    }
    pub async fn set_signals(&self, path: &str, s: OutputSignals) -> Result<()> {
        self.request(path, |r| Request::Set(s, r)).await
    }
    pub async fn get_signals(&self, path: &str) -> Result<InputSignals> {
        self.request(path, Request::Get).await
    }
    pub async fn send_break(&self, path: &str, ms: u64) -> Result<()> {
        self.request(path, |r| Request::Break(ms, r)).await
    }
    pub async fn close(&self, path: &str) -> Result<()> {
        let Some(entry) = self.entries.lock().await.get(path).cloned() else {
            return Ok(());
        };
        let mut done = entry.done.subscribe();
        entry.cancel.send_replace(true);
        let finished = *done.borrow_and_update();
        if !finished {
            let _ = done.changed().await;
        }

        Ok(())
    }
}
enum Connection {
    Serial(tokio_serial::SerialStream),
    Network(network::Network),
}
