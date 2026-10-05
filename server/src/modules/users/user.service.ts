import type { UserRepository } from './user.repository.js';

export class UserService {
  constructor(private readonly users: UserRepository) {}

  list() {
    return this.users.list();
  }

  findById(id: string) {
    return this.users.findById(id);
  }
}

