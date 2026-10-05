declare module 'fastify' {
  interface FastifyRequest {
    currentUserId: string;
  }

  interface FastifyContextConfig {
    public?: boolean;
  }
}

export {};
