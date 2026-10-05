import { AppError } from '../../shared/errors/app-error.js';
import { errors } from '../../shared/errors/errors.js';
import type { SqliteDatabase } from '../../database/database.types.js';
import { toUserDto } from './user.mapper.js';
import { seedUsers } from './seed-users.js';
import type { UserDto, UserRow } from './user.types.js';

export class UserRepository {
  constructor(private readonly database: SqliteDatabase) {}

  seed(): void {
    seedUsers(this.database);
  }

  list(): UserDto[] {
    const rows = this.database
      .prepare('SELECT id, login, display_name, avatar_color, status FROM users ORDER BY display_name')
      .all() as UserRow[];
    return rows.map(toUserDto);
  }

  findById(id: string): UserDto | null {
    const row = this.database
      .prepare('SELECT id, login, display_name, avatar_color, status FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
    return row ? toUserDto(row) : null;
  }

  requireActive(id: string): UserDto {
    const user = this.findById(id);
    if (!user) throw errors.unauthenticated();
    if (user.status !== 'ACTIVE') throw new AppError('USER_DISABLED', 'Пользователь отключён', 403);
    return user;
  }
}

