import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const livekitUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

export const roomService = new RoomServiceClient(
  livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
  apiKey,
  apiSecret
);

export async function createViewerToken(roomId: string, identity: string): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: 86400,
  });
  at.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  });
  // toJwt() returns a Promise in newer SDK versions — always await it
  const token = await Promise.resolve(at.toJwt());
  return String(token);
}

export async function createHostToken(roomId: string, identity: string): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: 86400,
  });
  at.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: true,
  });
  const token = await Promise.resolve(at.toJwt());
  return String(token);
}

export async function deleteRoom(roomId: string) {
  try {
    await roomService.deleteRoom(roomId);
  } catch {
    // Room may not exist
  }
}
