import type { UserDto, UserRow } from './user.types.js';

export function toUserDto(row: UserRow): UserDto {
  const { id, login, display_name: displayName, avatar_color: avatarColor, status } = row;
  return { id, login, displayName, avatarColor, status };
}

