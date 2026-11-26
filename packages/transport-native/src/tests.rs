use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    time::{timeout, Duration},
};
fn options() -> Options {
    Options {
        baud_rate: 115200,
        data_bits: 8,
        stop_bits: 1.,
        parity: "none".into(),
        flow_control: "none".into(),
    }
}
fn sink() -> (Sink, mpsc::UnboundedReceiver<Event>) {
    let (tx, rx) = mpsc::unbounded_channel();
    (
        Arc::new(move |e| {
            let _ = tx.send(e);
        }),
        rx,
    )
}
async fn data(rx: &mut mpsc::UnboundedReceiver<Event>, len: usize) -> Vec<u8> {
    timeout(Duration::from_secs(3), async {
        let mut out = Vec::new();
        while out.len() < len {
            if let Some(Event::Data { data, .. }) = rx.recv().await {
                out.extend(data);
            }
        }
        out
    })
    .await
    .expect("expected exact transport data")
}
#[tokio::test]
async fn tcp_client_roundtrip_close_and_reopen() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let path = format!("tcp://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for _ in 0..2 {
            let (mut s, _) = listener.accept().await.unwrap();
            let mut b = [0; 256];
            s.read_exact(&mut b).await.unwrap();
            s.write_all(&b).await.unwrap();
        }
    });
    let backend = Backend::default();
    let (tx, mut rx) = sink();
    for _ in 0..2 {
        backend
            .open(path.clone(), options(), tx.clone())
            .await
            .unwrap();
        assert!(backend
            .open(path.clone(), options(), tx.clone())
            .await
            .unwrap_err()
            .contains("already open"));
        let bytes: Vec<u8> = (0..=255).collect();
        backend.write(&path, bytes.clone()).await.unwrap();
        assert_eq!(data(&mut rx, 256).await, bytes);
        backend.close(&path).await.unwrap();
    }
    server.await.unwrap();
    backend.close(&path).await.unwrap();
    assert!(backend.write(&path, vec![1]).await.is_err());
}
#[tokio::test]
async fn server_broadcasts_and_survives_client_disconnect() {
    let temp = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = temp.local_addr().unwrap();
    drop(temp);
    let path = format!("tcp-server://{addr}");
    let backend = Backend::default();
    let (tx, mut rx) = sink();
    backend.open(path.clone(), options(), tx).await.unwrap();
    let mut a = TcpStream::connect(addr).await.unwrap();
    let mut b = TcpStream::connect(addr).await.unwrap();
    // Wait for both accept notices instead of relying on scheduler timing.
    for _ in 0..2 {
        assert!(matches!(
            timeout(Duration::from_secs(2), rx.recv()).await.unwrap(),
            Some(Event::Notice { .. })
        ));
    }
    a.write_all(b"A\0").await.unwrap();
    b.write_all(b"B\xff").await.unwrap();
    let bytes = data(&mut rx, 4).await;
    assert!(bytes == b"A\0B\xff" || bytes == b"B\xffA\0");
    backend.write(&path, vec![0, 255, 65]).await.unwrap();
    let (mut x, mut y) = ([0; 3], [0; 3]);
    a.read_exact(&mut x).await.unwrap();
    b.read_exact(&mut y).await.unwrap();
    assert_eq!(x, [0, 255, 65]);
    assert_eq!(x, y);
    drop(a);
    loop {
        if matches!(
            timeout(Duration::from_secs(2), rx.recv()).await.unwrap(),
            Some(Event::Notice { .. })
        ) {
            break;
        }
    }
    b.write_all(b"still listening").await.unwrap();
    assert_eq!(data(&mut rx, 15).await, b"still listening");
    assert!(backend.send_break(&path, 10).await.is_err());
    let signals = backend.get_signals(&path).await.unwrap();
    assert!(!signals.cts);
    backend.close(&path).await.unwrap();
    assert!(TcpStream::connect(addr).await.is_err());
}
#[tokio::test]
async fn telnet_network_negotiates_and_escapes() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let path = format!("telnet://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        s.write_all(&[255, 251]).await.unwrap();
        s.write_all(&[1, 65, 13, 0, 255, 255]).await.unwrap();
        let mut reply = [0; 3];
        s.read_exact(&mut reply).await.unwrap();
        assert_eq!(reply, [255, 253, 1]);
        let mut sent = [0; 5];
        s.read_exact(&mut sent).await.unwrap();
        assert_eq!(sent, [66, 255, 255, 13, 0]);
    });
    let backend = Backend::default();
    let (tx, mut rx) = sink();
    backend.open(path.clone(), options(), tx).await.unwrap();
    assert_eq!(data(&mut rx, 3).await, [65, 13, 255]);
    backend.write(&path, vec![66, 255, 13]).await.unwrap();
    server.await.unwrap();
    backend.close(&path).await.unwrap();
}
#[test]
fn telnet_fragmentation_and_loop_guard() {
    let input = [
        255, 251, 3, 255, 251, 1, 255, 253, 3, 255, 253, 1, 255, 251, 42, 255, 250, 42, 9, 255,
        240, 65, 13, 0, 66, 255, 255,
    ];
    for split in 0..=input.len() {
        let mut codec = telnet::Telnet::default();
        let (a, x) = codec.decode(&input[..split]);
        let (b, y) = codec.decode(&input[split..]);
        assert_eq!([a, b].concat(), [65, 13, 66, 255]);
        assert_eq!(
            [x, y].concat(),
            [255, 253, 3, 255, 253, 1, 255, 251, 3, 255, 252, 1, 255, 254, 42]
        );
        assert!(codec.decode(&[255, 251, 42]).1.is_empty());
    }
    assert_eq!(
        telnet::Telnet::encode(&[13, 10, 255, 13]),
        [13, 10, 255, 255, 13, 0]
    );
}
#[tokio::test]
async fn rejected_open_does_not_reserve_path() {
    let backend = Backend::default();
    let (tx, _rx) = sink();
    for _ in 0..2 {
        let e = backend
            .open("invalid://host:1".into(), options(), tx.clone())
            .await
            .unwrap_err();
        assert!(e.contains("Invalid network protocol"));
    }
    assert!(backend.entries.lock().await.is_empty());
}
#[cfg(unix)]
#[tokio::test]
async fn serial_native_pty_exact_bytes_and_reopen() {
    use nix::pty::openpty;
    use std::os::fd::FromRawFd;
    let pty = openpty(None, None).unwrap();
    let path = nix::unistd::ttyname(pty.slave)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let master = unsafe { std::fs::File::from_raw_fd(pty.master) };
    let _slave = unsafe { std::fs::File::from_raw_fd(pty.slave) };
    let mut master = tokio::fs::File::from_std(master);
    let backend = Backend::default();
    let (tx, mut rx) = sink();
    for _ in 0..2 {
        backend
            .open(path.clone(), options(), tx.clone())
            .await
            .unwrap();
        let bytes: Vec<u8> = (0..=255).collect();
        backend.write(&path, bytes.clone()).await.unwrap();
        let mut got = vec![0; 256];
        timeout(Duration::from_secs(2), master.read_exact(&mut got))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(got, bytes);
        master.write_all(&bytes).await.unwrap();
        assert_eq!(data(&mut rx, 256).await, bytes);
        backend.close(&path).await.unwrap();
    }
}

#[tokio::test]
async fn tcp_large_binary_stream_is_lossless() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let path = format!("tcp://{}", listener.local_addr().unwrap());
    let expected: Vec<u8> = (0..1024 * 1024).map(|i| (i % 251) as u8).collect();
    let bytes = expected.clone();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        stream.write_all(&bytes).await.unwrap();
    });
    let backend = Backend::default();
    let (tx, mut rx) = sink();
    backend.open(path.clone(), options(), tx).await.unwrap();
    assert_eq!(data(&mut rx, expected.len()).await, expected);
    server.await.unwrap();
    backend.close(&path).await.unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn close_cancels_a_blocked_serial_write() {
    use std::os::fd::FromRawFd;
    let pty = nix::pty::openpty(None, None).unwrap();
    let path = nix::unistd::ttyname(pty.slave)
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let _master = unsafe { std::fs::File::from_raw_fd(pty.master) };
    let _slave = unsafe { std::fs::File::from_raw_fd(pty.slave) };
    let backend = Backend::default();
    let (tx, _rx) = sink();
    backend
        .open(path.clone(), options(), tx.clone())
        .await
        .unwrap();
    let writer = backend.clone();
    let write_path = path.clone();
    let mut write =
        tokio::spawn(async move { writer.write(&write_path, vec![42; 1024 * 1024]).await });
    // The master never drains the PTY, so the pending write fills the kernel buffer.
    assert!(timeout(Duration::from_millis(30), &mut write)
        .await
        .is_err());
    timeout(Duration::from_secs(1), backend.close(&path))
        .await
        .unwrap()
        .unwrap();
    assert!(write.await.unwrap().is_err());
    backend.open(path.clone(), options(), tx).await.unwrap();
    backend.close(&path).await.unwrap();
}
