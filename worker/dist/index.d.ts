export interface Env {
    INVENTORY_KV: KVNamespace;
    TABIRA_USUARIOS: KVNamespace;
    IP_SALT?: string;
}
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
