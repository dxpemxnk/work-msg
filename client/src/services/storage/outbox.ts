import type { OutboxCommand } from '@/types/messenger';

const DATABASE_NAME = 'ems-messenger-client';
const STORE_NAME = 'outbox';
const DATABASE_VERSION = 1;

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'clientMessageId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Операция IndexedDB отменена'));
  });
}

export async function saveOutboxCommand(command: OutboxCommand): Promise<void> {
  const database = await openOutbox();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(command);
  await complete(transaction);
  database.close();
}

export async function removeOutboxCommand(clientMessageId: string): Promise<void> {
  const database = await openOutbox();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(clientMessageId);
  await complete(transaction);
  database.close();
}

export async function listOutboxCommands(userId: string): Promise<OutboxCommand[]> {
  const database = await openOutbox();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll();
  const commands = await new Promise<OutboxCommand[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as OutboxCommand[]);
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать outbox'));
  });
  database.close();
  return commands
    .filter((command) => command.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

