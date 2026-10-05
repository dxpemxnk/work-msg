export class PresenceRegistry {
  private readonly connectionCounts = new Map<string, number>();

  connect(userId: string): boolean {
    const currentCount = this.connectionCounts.get(userId) ?? 0;
    this.connectionCounts.set(userId, currentCount + 1);
    return currentCount === 0;
  }

  disconnect(userId: string): boolean {
    const currentCount = this.connectionCounts.get(userId) ?? 0;
    if (currentCount <= 1) {
      this.connectionCounts.delete(userId);
      return currentCount === 1;
    }

    this.connectionCounts.set(userId, currentCount - 1);
    return false;
  }

  onlineUserIds(): string[] {
    return [...this.connectionCounts.keys()];
  }

  isOnline(userId: string): boolean {
    return this.connectionCounts.has(userId);
  }
}
