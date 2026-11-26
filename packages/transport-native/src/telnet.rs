use std::collections::HashSet;

/// Stateful RFC 854 framing; each peer owns a codec, including server clients.
#[derive(Default)]
pub struct Telnet {
    state: u8,
    verb: u8,
    answered: HashSet<(u8, u8)>,
}

impl Telnet {
    pub fn decode(&mut self, bytes: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let (mut data, mut reply) = (Vec::new(), Vec::new());
        for &b in bytes {
            match self.state {
                0 => match b {
                    255 => self.state = 1,
                    13 => {
                        data.push(b);
                        self.state = 5;
                    }
                    _ => data.push(b),
                },
                5 => {
                    self.state = 0;
                    match b {
                        0 => {}
                        255 => self.state = 1,
                        13 => {
                            data.push(b);
                            self.state = 5;
                        }
                        _ => data.push(b),
                    }
                }
                1 => match b {
                    255 => {
                        data.push(b);
                        self.state = 0;
                    }
                    251..=254 => {
                        self.verb = b;
                        self.state = 2;
                    }
                    250 => self.state = 3,
                    _ => self.state = 0,
                },
                2 => {
                    if self.answered.insert((self.verb, b)) {
                        match self.verb {
                            251 => reply.extend([255, if b == 1 || b == 3 { 253 } else { 254 }, b]),
                            253 => reply.extend([255, if b == 3 { 251 } else { 252 }, b]),
                            _ => {}
                        }
                    }
                    self.state = 0;
                }
                3 => {
                    if b == 255 {
                        self.state = 4;
                    }
                }
                4 => self.state = if b == 240 { 0 } else { 3 },
                _ => unreachable!(),
            }
        }
        (data, reply)
    }

    pub fn encode(bytes: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        for (i, &b) in bytes.iter().enumerate() {
            out.push(b);
            if b == 255 {
                out.push(255);
            } else if b == 13 && bytes.get(i + 1) != Some(&10) {
                out.push(0);
            }
        }
        out
    }
}
