import type { Platform } from '@studioflow360/shared';

export interface Env {
  DB: D1Database;
  EMAIL_DEDUP: KVNamespace;
  GRAPH_STATE: KVNamespace;
  EMAIL_ARCHIVE: R2Bucket;
  BOOKING_PARSE_QUEUE: Queue;
  AI: Ai;

  // Azure secrets
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_MAILBOX_USER_ID: string;
}

export interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface GraphMessage {
  id: string;
  internetMessageId: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  body: {
    contentType: 'html' | 'text';
    content: string;
  };
  isRead: boolean;
}

export interface GraphMessagesResponse {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
}

export interface PlatformRule {
  platform: Platform;
  sender_domain: string;
}
