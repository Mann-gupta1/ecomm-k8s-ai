export type StoreEngine = 'woocommerce' | 'medusa';

export type StoreStatus = 'Provisioning' | 'Ready' | 'Failed';

export interface StoreMetadata {
  id: string;
  name: string;
  engine: StoreEngine;
  status: StoreStatus;
  createdAt: string; // ISO
  urls: string[];
  message?: string; // error message when Failed
}

export interface CreateStoreRequest {
  name: string;
  engine: StoreEngine;
}

export interface CreateStoreResponse {
  id: string;
  name: string;
  engine: StoreEngine;
  status: StoreStatus;
  createdAt: string;
  urls: string[];
}
