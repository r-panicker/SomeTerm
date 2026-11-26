use crate::{error, Event, InputSignals, Options, Request, Result, Sink};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::mpsc,
    time::{Duration, Instant},
};
use tokio_serial::{
    DataBits, FlowControl, Parity, SerialPort, SerialPortBuilderExt, SerialStream, StopBits,
};

pub fn open(path: &str, o: &Options) -> Result<SerialStream> {
    if o.baud_rate == 0 {
        return Err("Baud rate must be positive".into());
    }
    let bits = match o.data_bits {
        5 => DataBits::Five,
        6 => DataBits::Six,
        7 => DataBits::Seven,
        8 => DataBits::Eight,
        _ => return Err("Data bits must be 5–8".into()),
    };
    let parity = match o.parity.as_str() {
        "none" => Parity::None,
        "even" => Parity::Even,
        "odd" => Parity::Odd,
        "mark" | "space" if cfg!(windows) => Parity::None,
        "mark" | "space" => {
            return Err(format!("{} parity is only available on Windows", o.parity))
        }
        _ => return Err("Invalid parity".into()),
    };
    let stops = if o.stop_bits == 1.0 || (cfg!(windows) && o.stop_bits == 1.5) {
        StopBits::One
    } else if o.stop_bits == 2.0 {
        StopBits::Two
    } else {
        return Err("Invalid stop bits for this platform".into());
    };
    let flow = match o.flow_control.as_str() {
        "none" => FlowControl::None,
        "rtscts" => FlowControl::Hardware,
        "xonxoff" => FlowControl::Software,
        _ => return Err("Unsupported flow control".into()),
    };
    let port = tokio_serial::new(path, o.baud_rate)
        .data_bits(bits)
        .parity(parity)
        .stop_bits(stops)
        .flow_control(flow)
        .open_native_async()
        .map_err(error)?;
    #[cfg(windows)]
    configure_windows(&port, o)?;
    Ok(port)
}

#[cfg(windows)]
fn configure_windows(port: &SerialStream, o: &Options) -> Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Devices::Communication::{
        GetCommState, SetCommState, DCB, MARKPARITY, ONE5STOPBITS, SPACEPARITY,
    };
    let mut dcb: DCB = unsafe { std::mem::zeroed() };
    dcb.DCBlength = std::mem::size_of::<DCB>() as u32;
    // serialport does not expose Windows mark/space parity or 1.5 stop bits.
    unsafe {
        if GetCommState(port.as_raw_handle(), &mut dcb) == 0 {
            return Err(error(std::io::Error::last_os_error()));
        }
        if o.parity == "mark" {
            dcb.Parity = MARKPARITY;
            dcb._bitfield |= 1 << 1;
        }
        if o.parity == "space" {
            dcb.Parity = SPACEPARITY;
            dcb._bitfield |= 1 << 1;
        }
        if o.stop_bits == 1.5 {
            dcb.StopBits = ONE5STOPBITS;
        }
        if SetCommState(port.as_raw_handle(), &dcb) == 0 {
            return Err(error(std::io::Error::last_os_error()));
        }
    }
    Ok(())
}

pub async fn run(
    mut port: SerialStream,
    path: &str,
    sink: &Sink,
    mut requests: mpsc::Receiver<Request>,
) {
    let mut buf = [0; 16384];
    let mut breaking: Option<(Instant, crate::Reply<()>)> = None;
    enum Action {
        Data(std::io::Result<usize>),
        BreakExpired,
        Request(Option<Request>),
    }
    loop {
        let deadline = breaking
            .as_ref()
            .map(|b| b.0)
            .unwrap_or_else(|| Instant::now() + Duration::from_secs(86400));
        let action = tokio::select! {
            data=port.read(&mut buf)=>Action::Data(data),
            _=tokio::time::sleep_until(deadline), if breaking.is_some()=>Action::BreakExpired,
            request=requests.recv()=>Action::Request(request),
        };
        match action {
            Action::Data(data) => match data {
                Ok(0) => break,
                Ok(n) => sink(Event::Data {
                    path: path.into(),
                    data: buf[..n].to_vec(),
                }),
                Err(e) => {
                    sink(Event::Error {
                        path: path.into(),
                        message: error(e),
                    });
                    break;
                }
            },
            Action::BreakExpired => {
                let (_, r) = breaking.take().unwrap();
                let _ = r.send(port.clear_break().map_err(error));
            }
            Action::Request(request) => match request {
                Some(Request::Write(data, r)) => {
                    let _ = r.send(port.write_all(&data).await.map_err(error));
                }
                Some(Request::Set(s, r)) => {
                    let result = (|| {
                        if let Some(dtr) = s.dtr {
                            port.write_data_terminal_ready(dtr).map_err(error)?;
                        }
                        if let Some(rts) = s.rts {
                            port.write_request_to_send(rts).map_err(error)?;
                        }
                        Ok(())
                    })();
                    let _ = r.send(result);
                }
                Some(Request::Get(r)) => {
                    let _ = r.send((|| {
                        Ok(InputSignals {
                            cts: port.read_clear_to_send().map_err(error)?,
                            dsr: port.read_data_set_ready().map_err(error)?,
                            dcd: port.read_carrier_detect().map_err(error)?,
                            ri: false,
                        })
                    })());
                }
                Some(Request::Break(ms, r)) => {
                    if breaking.is_some() {
                        let _ = r.send(Err("A break is already in progress".into()));
                    } else if let Some(deadline) =
                        Instant::now().checked_add(Duration::from_millis(ms))
                    {
                        match port.set_break() {
                            Ok(()) => breaking = Some((deadline, r)),
                            Err(e) => {
                                let _ = r.send(Err(error(e)));
                            }
                        }
                    } else {
                        let _ = r.send(Err("Break duration is too large".into()));
                    }
                }
                None => break,
            },
        }
    }
    if let Some((_, r)) = breaking {
        let _ = port.clear_break();
        let _ = r.send(Err("Connection closed".into()));
    }
}
