use crate::{error, telnet::Telnet, Event, InputSignals, Request, Result, Sink};
use std::collections::HashMap;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{tcp::OwnedWriteHalf, TcpListener, TcpStream},
    sync::mpsc,
    task::JoinHandle,
    time::{timeout, Duration},
};

pub struct Network {
    listener: Option<TcpListener>,
    stream: Option<TcpStream>,
    telnet: bool,
}
struct Peer {
    writer: OwnedWriteHalf,
    reader: JoinHandle<()>,
    codec: Option<Telnet>,
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.reader.abort();
    }
}
enum Incoming {
    Data(u64, Vec<u8>),
    Closed(u64, Option<String>),
}
impl Network {
    pub async fn open(path: &str) -> Result<Self> {
        let normalized = path.replace("://:", "://0.0.0.0:");
        let url = url::Url::parse(&normalized).map_err(error)?;
        let (server, telnet) = match url.scheme() {
            "tcp" => (false, false),
            "tcp-server" => (true, false),
            "telnet" => (false, true),
            "telnet-server" => (true, true),
            _ => return Err("Invalid network protocol".into()),
        };
        let host = url
            .host_str()
            .unwrap_or("")
            .trim_start_matches('[')
            .trim_end_matches(']');
        let port = url
            .port()
            .filter(|p| *p > 0)
            .ok_or("Port must be 1 to 65535")?;
        if server {
            Ok(Self {
                listener: Some(
                    TcpListener::bind((if host.is_empty() { "0.0.0.0" } else { host }, port))
                        .await
                        .map_err(error)?,
                ),
                stream: None,
                telnet,
            })
        } else {
            let stream = timeout(Duration::from_secs(10), TcpStream::connect((host, port)))
                .await
                .map_err(|_| "No answer within 10 s".to_string())?
                .map_err(error)?;
            Ok(Self {
                listener: None,
                stream: Some(stream),
                telnet,
            })
        }
    }
    fn adopt(
        stream: TcpStream,
        id: u64,
        telnet: bool,
        events: mpsc::Sender<Incoming>,
    ) -> Result<Peer> {
        stream.set_nodelay(true).map_err(error)?;
        let (mut reader, writer) = stream.into_split();
        let task = tokio::spawn(async move {
            let mut buf = [0; 16384];
            loop {
                match reader.read(&mut buf).await {
                    Ok(0) => {
                        let _ = events.send(Incoming::Closed(id, None)).await;
                        break;
                    }
                    Ok(n) => {
                        if events
                            .send(Incoming::Data(id, buf[..n].to_vec()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = events.send(Incoming::Closed(id, Some(error(e)))).await;
                        break;
                    }
                }
            }
        });
        Ok(Peer {
            writer,
            reader: task,
            codec: telnet.then(Telnet::default),
        })
    }
    pub async fn run(mut self, path: &str, sink: &Sink, mut requests: mpsc::Receiver<Request>) {
        let (events, mut incoming) = mpsc::channel(64);
        let mut peers = HashMap::new();
        let mut next = 0;
        let server = self.listener.is_some();
        if let Some(stream) = self.stream.take() {
            match Self::adopt(stream, next, self.telnet, events.clone()) {
                Ok(peer) => {
                    peers.insert(next, peer);
                    next += 1;
                }
                Err(e) => {
                    sink(Event::Error {
                        path: path.into(),
                        message: e,
                    });
                    return;
                }
            }
        }
        enum Action {
            Accepted(std::io::Result<(TcpStream, std::net::SocketAddr)>),
            Incoming(Incoming),
            Request(Option<Request>),
        }
        loop {
            let action = tokio::select! {
                accepted=async{self.listener.as_ref().unwrap().accept().await}, if server=>Action::Accepted(accepted),
                Some(event)=incoming.recv()=>Action::Incoming(event),
                request=requests.recv()=>Action::Request(request),
            };
            match action {
                Action::Accepted(accepted) => match accepted {
                    Ok((stream, addr)) => {
                        match Self::adopt(stream, next, self.telnet, events.clone()) {
                            Ok(peer) => {
                                peers.insert(next, peer);
                                next += 1;
                                sink(Event::Notice {
                                    path: path.into(),
                                    text: format!("{addr} connected · {} connected", peers.len()),
                                });
                            }
                            Err(e) => sink(Event::Error {
                                path: path.into(),
                                message: e,
                            }),
                        }
                    }
                    Err(e) => {
                        sink(Event::Error {
                            path: path.into(),
                            message: error(e),
                        });
                        break;
                    }
                },
                Action::Incoming(event) => match event {
                    Incoming::Data(id, data) => {
                        if let Some(peer) = peers.get_mut(&id) {
                            let (data, reply) = match &mut peer.codec {
                                Some(c) => c.decode(&data),
                                None => (data, Vec::new()),
                            };
                            if !reply.is_empty() {
                                if let Err(e) = peer.writer.write_all(&reply).await {
                                    sink(Event::Error {
                                        path: path.into(),
                                        message: error(e),
                                    });
                                }
                            }
                            if !data.is_empty() {
                                sink(Event::Data {
                                    path: path.into(),
                                    data,
                                });
                            }
                        }
                    }
                    Incoming::Closed(id, err) => {
                        let addr = peers.get(&id).and_then(|p| p.writer.peer_addr().ok());
                        peers.remove(&id);
                        if server {
                            sink(Event::Notice {
                                path: path.into(),
                                text: format!(
                                    "{} disconnected · {} connected",
                                    addr.map(|a| a.to_string()).unwrap_or_default(),
                                    peers.len()
                                ),
                            });
                        } else {
                            if let Some(message) = err {
                                sink(Event::Error {
                                    path: path.into(),
                                    message,
                                });
                            }
                            break;
                        }
                    }
                },
                Action::Request(request) => match request {
                    Some(Request::Write(data, r)) => {
                        let data = if self.telnet {
                            Telnet::encode(&data)
                        } else {
                            data
                        };
                        let mut result = Ok(());
                        for peer in peers.values_mut() {
                            match timeout(Duration::from_secs(10), peer.writer.write_all(&data))
                                .await
                            {
                                Ok(Ok(())) => {}
                                Ok(Err(e)) => result = Err(error(e)),
                                Err(e) => result = Err(error(e)),
                            }
                        }
                        let _ = r.send(result);
                    }
                    Some(Request::Set(_, r)) => {
                        let _ = r.send(Ok(()));
                    }
                    Some(Request::Get(r)) => {
                        let _ = r.send(Ok(InputSignals::default()));
                    }
                    Some(Request::Break(_, r)) => {
                        let _ = r.send(Err("A network connection has no break signal".into()));
                    }
                    None => break,
                },
            }
        }
    }
}
