import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export class PeerConnectionManager {
  private connections = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private socket: Socket;
  private onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private onPeerDisconnected: (peerId: string) => void;

  constructor(
    socket: Socket,
    onRemoteStream: (peerId: string, stream: MediaStream) => void,
    onPeerDisconnected: (peerId: string) => void,
  ) {
    this.socket = socket;
    this.onRemoteStream = onRemoteStream;
    this.onPeerDisconnected = onPeerDisconnected;

    // Listen for signaling events
    this.socket.on("webrtc:offer", async (data: { sdp: string; from: string }) => {
      await this.handleOffer(data.from, data.sdp);
    });

    this.socket.on("webrtc:answer", async (data: { sdp: string; from: string }) => {
      await this.handleAnswer(data.from, data.sdp);
    });

    this.socket.on("webrtc:ice", async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      await this.handleIceCandidate(data.from, data.candidate);
    });
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;

    // Add tracks to existing connections
    for (const [, pc] of this.connections) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }
  }

  async createOffer(peerId: string): Promise<void> {
    const pc = this.getOrCreateConnection(peerId);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit("webrtc:offer", {
      sdp: offer.sdp!,
      to: peerId,
    });
  }

  private async handleOffer(peerId: string, sdp: string): Promise<void> {
    const pc = this.getOrCreateConnection(peerId);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.socket.emit("webrtc:answer", {
      sdp: answer.sdp!,
      to: peerId,
    });
  }

  private async handleAnswer(peerId: string, sdp: string): Promise<void> {
    const pc = this.connections.get(peerId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.connections.get(peerId);
    if (!pc) return;

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private getOrCreateConnection(peerId: string): RTCPeerConnection {
    let pc = this.connections.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(ICE_SERVERS);
    this.connections.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("webrtc:ice", {
          candidate: event.candidate.toJSON(),
          to: peerId,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === "disconnected" || pc!.connectionState === "failed") {
        this.removePeer(peerId);
        this.onPeerDisconnected(peerId);
      }
    };

    return pc;
  }

  removePeer(peerId: string): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.close();
      this.connections.delete(peerId);
    }
  }

  destroy(): void {
    for (const [id, pc] of this.connections) {
      pc.close();
      this.connections.delete(id);
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}
