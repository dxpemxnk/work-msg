export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface UserDto {
  id: string;
  login: string;
  displayName: string;
  avatarColor: string;
  status: UserStatus;
}

export interface UserRow {
  id: string;
  login: string;
  display_name: string;
  avatar_color: string;
  status: UserStatus;
}

