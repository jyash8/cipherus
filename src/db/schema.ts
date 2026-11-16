import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const credentials = sqliteTable("credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteName: text("site_name").notNull(),
  siteUrl: text("site_url"),
  username: text("username").notNull(),
  category: text("category").notNull().default("General"),
  salt: text("salt").notNull(),
  iv: text("iv").notNull(),
  ciphertext: text("ciphertext").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
