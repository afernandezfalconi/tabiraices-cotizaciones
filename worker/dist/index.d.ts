export interface Env {
    INVENTORY_KV: KVNamespace;
}
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
