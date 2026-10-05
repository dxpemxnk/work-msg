import { API_URL } from '@config/index';
import { io, type Socket } from 'socket.io-client';

export function createMessengerSocket(): Socket {
  return io(API_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

