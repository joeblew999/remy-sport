/** `.sql` files import as text — see the [[rules]] block in wrangler.toml. */
declare module "*.sql" {
  const sql: string
  export default sql
}
