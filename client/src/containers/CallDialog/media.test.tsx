// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CallSession, User } from '@/types/messenger';
import { CallDialog } from './index';
import { GroupCallDialog } from '@containers/GroupCallDialog';

const user: User = { id: 'one', login: 'one', displayName: 'One', avatarColor: '#123', status: 'ACTIVE' };
const peer = { ...user, id: 'two' };
const noAction = () => undefined;
const session: CallSession = {
  callId: 'call', conversationId: 'chat', peer, mode: 'video', direction: 'incoming', status: 'ringing', startedAt: null,
};
afterEach(() => cleanup());

describe('call media elements', () => {
  it('attaches captured video when an incoming call changes from ringing to connecting', () => {
    const stream = {} as MediaStream;
    const props = {
      session, localStream: stream, remoteStream: stream, muted: false, cameraOff: false,
      onAccept: noAction, onReject: noAction, onEnd: noAction, onToggleMute: noAction, onToggleCamera: noAction,
    };
    const view = render(<CallDialog {...props} />);
    expect(document.querySelectorAll('video')).toHaveLength(0);
    view.rerender(<CallDialog {...props} session={{ ...session, status: 'connecting' }} />);
    const videos = [...document.querySelectorAll('video')];
    expect(videos).toHaveLength(2);
    expect(videos.every(video => video.srcObject === stream)).toBe(true);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(videos.filter(video => video.muted)).toHaveLength(1);
  });

  it('plays remote group sound exactly once in audio and video modes', () => {
    const props = {
      session: { conversationId: 'chat', title: 'Group', mode: 'video' as const, participants: [user, peer], startedAt: 0 },
      currentUser: user, localStream: {} as MediaStream, remoteStreams: [{ user: peer, stream: {} as MediaStream }],
      muted: false, cameraOff: false, onLeave: vi.fn(), onToggleMute: noAction, onToggleCamera: noAction,
    };
    const view = render(<GroupCallDialog {...props} />);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect([...document.querySelectorAll('video')].filter(video => !video.muted)).toHaveLength(1);
    view.rerender(<GroupCallDialog {...props} session={{ ...props.session, mode: 'audio' }} />);
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(document.querySelectorAll('audio')).toHaveLength(1);
  });
});
