import { pgTable, serial, varchar, timestamp, integer, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userDatabases = pgTable(
  'user_databases',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    databaseUrl: varchar('database_url', { length: 1024 }).notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => {
    return {
      userUnique: uniqueIndex('user_databases_user_id_unique').on(table.userId),
    }
  }
);