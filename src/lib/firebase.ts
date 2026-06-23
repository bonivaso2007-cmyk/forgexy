export const db = null;

export const auth = {
  signOut: async () => {},
  currentUser: null
};

// Authentication Providers
export const googleProvider = null;
export const emailProvider = null;

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error("Firestore Error Mock: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

