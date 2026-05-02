// Re-export the types generated against the linked Supabase project. Both
// apps share the same schema so we share the same generated file rather
// than running `gen types` twice. If the relative path looks ugly: blame
// the monorepo-light layout, not the generator.
export type { Database } from '../../mobile/types/database';
