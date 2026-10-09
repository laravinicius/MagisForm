export type TenantAction = 'start' | 'stop' | 'restart';

export type TenantContainer = {
  name: string;
  service: string;
  image: string;
  state: string;
  health: string | null;
};

export type ManagedTenant = {
  id: string;
  name: string;
  host: string;
  image: string;
  status: string;
  createdAt: string;
  containers: TenantContainer[];
};

export type CreateTenantInput = {
  id: string;
  host: string;
  name: string;
  adminName: string;
  adminUsername: string;
  image: string;
};

export type InitialAdminCredentials = { name: string; username: string; password: string };

export type TenantPackage = {
  id: string;
  host: string;
  name: string;
  image: string;
  compose: string;
  envExample: string;
  instructions: string;
};

export interface TenantControl {
  list(): Promise<ManagedTenant[]>;
  create(input: CreateTenantInput): Promise<InitialAdminCredentials>;
  action(id: string, action: TenantAction): Promise<void>;
  generate(input: CreateTenantInput): Promise<TenantPackage>;
}
