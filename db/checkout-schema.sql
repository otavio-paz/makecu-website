CREATE TABLE IF NOT EXISTS checkout_teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('team', 'admin')),
  team_id BIGINT REFERENCES checkout_teams(id),
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'team' AND team_id IS NOT NULL) OR (role = 'admin' AND team_id IS NULL))
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES checkout_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_components (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  compatibility TEXT NOT NULL CHECK (compatibility IN ('Arduino', 'Raspberry Pi', 'Arduino + Raspberry Pi', 'N/A')),
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  checked_out_quantity INTEGER NOT NULL DEFAULT 0 CHECK (checked_out_quantity >= 0),
  unavailable_quantity INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_quantity >= 0),
  max_active_per_team INTEGER CHECK (max_active_per_team IS NULL OR max_active_per_team > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved_quantity + checked_out_quantity + unavailable_quantity <= total_quantity)
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES checkout_teams(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'ready', 'picked_up', 'cancelled')),
  reviewed_by BIGINT REFERENCES checkout_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS checkout_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES checkout_orders(id) ON DELETE CASCADE,
  component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
  approved_quantity INTEGER NOT NULL CHECK (approved_quantity >= 0),
  adjustment_reason TEXT,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (order_id, component_id)
);

CREATE TABLE IF NOT EXISTS checkout_team_inventory (
  team_id BIGINT NOT NULL REFERENCES checkout_teams(id),
  component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  checked_out_quantity INTEGER NOT NULL DEFAULT 0 CHECK (checked_out_quantity >= 0),
  PRIMARY KEY (team_id, component_id)
);

CREATE TABLE IF NOT EXISTS checkout_return_receipts (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES checkout_teams(id),
  processed_by BIGINT NOT NULL REFERENCES checkout_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_return_items (
  id BIGSERIAL PRIMARY KEY,
  return_receipt_id BIGINT NOT NULL REFERENCES checkout_return_receipts(id) ON DELETE CASCADE,
  component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  condition TEXT NOT NULL CHECK (condition IN ('good', 'damaged', 'missing')),
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS checkout_inventory_transactions (
  id BIGSERIAL PRIMARY KEY,
  component_id BIGINT REFERENCES checkout_components(id),
  team_id BIGINT REFERENCES checkout_teams(id),
  order_id BIGINT REFERENCES checkout_orders(id),
  admin_id BIGINT REFERENCES checkout_users(id),
  actor_user_id BIGINT REFERENCES checkout_users(id),
  transaction_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_activity (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES checkout_users(id),
  team_id BIGINT REFERENCES checkout_teams(id),
  order_id BIGINT REFERENCES checkout_orders(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checkout_orders_team_created_idx ON checkout_orders(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_orders_status_created_idx ON checkout_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_activity_created_idx ON checkout_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_transactions_created_idx ON checkout_inventory_transactions(created_at DESC);
