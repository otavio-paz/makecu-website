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
  image_alt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  compatibility TEXT NOT NULL CHECK (compatibility IN ('Arduino', 'Raspberry Pi', 'Arduino + Raspberry Pi', 'N/A')),
  arduino_guidance TEXT NOT NULL DEFAULT '',
  raspberry_pi_guidance TEXT NOT NULL DEFAULT '',
  bin_location TEXT NOT NULL DEFAULT '',
  technical_specs TEXT NOT NULL DEFAULT '',
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  checked_out_quantity INTEGER NOT NULL DEFAULT 0 CHECK (checked_out_quantity >= 0),
  unavailable_quantity INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_quantity >= 0),
  protected_stock INTEGER NOT NULL DEFAULT 0 CHECK (protected_stock >= 0 AND protected_stock <= total_quantity),
  max_active_per_team INTEGER CHECK (max_active_per_team IS NULL OR max_active_per_team > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved_quantity + checked_out_quantity + unavailable_quantity <= total_quantity)
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id BIGSERIAL PRIMARY KEY,
  receipt_code TEXT UNIQUE,
  team_id BIGINT NOT NULL REFERENCES checkout_teams(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'accepted', 'ready', 'picked_up', 'cancelled', 'expired')),
  reviewed_by BIGINT REFERENCES checkout_users(id),
  accepted_by BIGINT REFERENCES checkout_users(id),
  ready_by BIGINT REFERENCES checkout_users(id),
  picked_up_by BIGINT REFERENCES checkout_users(id),
  cancelled_by BIGINT REFERENCES checkout_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewing_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  reservation_expires_at TIMESTAMPTZ,
  cancellation_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS checkout_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES checkout_orders(id) ON DELETE CASCADE,
  component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
  approved_quantity INTEGER NOT NULL CHECK (approved_quantity >= 0),
  adjustment_reason TEXT,
  note TEXT NOT NULL DEFAULT '',
  component_name_snapshot TEXT NOT NULL DEFAULT '',
  component_image_url_snapshot TEXT NOT NULL DEFAULT '',
  component_image_alt_snapshot TEXT NOT NULL DEFAULT '',
  component_category_snapshot TEXT NOT NULL DEFAULT '',
  UNIQUE (order_id, component_id)
);

CREATE TABLE IF NOT EXISTS checkout_team_inventory (
  team_id BIGINT NOT NULL REFERENCES checkout_teams(id),
  component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  checked_out_quantity INTEGER NOT NULL DEFAULT 0 CHECK (checked_out_quantity >= 0),
  PRIMARY KEY (team_id, component_id)
);

CREATE TABLE IF NOT EXISTS checkout_component_relationships (
  id BIGSERIAL PRIMARY KEY,
  source_component_id BIGINT NOT NULL REFERENCES checkout_components(id) ON DELETE CASCADE,
  target_component_id BIGINT NOT NULL REFERENCES checkout_components(id),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('requires', 'recommends', 'compatible_driver', 'compatible_power_supply')),
  quantity_ratio NUMERIC(10, 3) NOT NULL DEFAULT 1 CHECK (quantity_ratio > 0),
  minimum_source_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_source_quantity > 0),
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_component_id <> target_component_id),
  UNIQUE (source_component_id, target_component_id, relation_type)
);

CREATE TABLE IF NOT EXISTS checkout_return_receipts (
  id BIGSERIAL PRIMARY KEY,
  receipt_code TEXT UNIQUE,
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
  note TEXT NOT NULL DEFAULT '',
  component_name_snapshot TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS checkout_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES checkout_orders(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES checkout_users(id),
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkout_idempotency_requests (
  actor_user_id BIGINT NOT NULL REFERENCES checkout_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL DEFAULT '',
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_user_id, action, idempotency_key)
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
CREATE INDEX IF NOT EXISTS checkout_order_events_order_created_idx ON checkout_order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS checkout_relationships_source_idx ON checkout_component_relationships(source_component_id);
CREATE INDEX IF NOT EXISTS checkout_relationships_target_idx ON checkout_component_relationships(target_component_id);

ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS image_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS bin_location TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS technical_specs TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS protected_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS arduino_guidance TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_components ADD COLUMN IF NOT EXISTS raspberry_pi_guidance TEXT NOT NULL DEFAULT '';

ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS receipt_code TEXT UNIQUE;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS accepted_by BIGINT REFERENCES checkout_users(id);
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS ready_by BIGINT REFERENCES checkout_users(id);
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS picked_up_by BIGINT REFERENCES checkout_users(id);
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS cancelled_by BIGINT REFERENCES checkout_users(id);
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
ALTER TABLE checkout_orders ADD COLUMN IF NOT EXISTS cancellation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_orders DROP CONSTRAINT IF EXISTS checkout_orders_status_check;
ALTER TABLE checkout_orders ADD CONSTRAINT checkout_orders_status_check
  CHECK (status IN ('submitted', 'reviewing', 'accepted', 'ready', 'picked_up', 'cancelled', 'expired'));

ALTER TABLE checkout_order_items ADD COLUMN IF NOT EXISTS component_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_order_items ADD COLUMN IF NOT EXISTS component_image_url_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_order_items ADD COLUMN IF NOT EXISTS component_image_alt_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_order_items ADD COLUMN IF NOT EXISTS component_category_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE checkout_return_receipts ADD COLUMN IF NOT EXISTS receipt_code TEXT UNIQUE;
ALTER TABLE checkout_return_items ADD COLUMN IF NOT EXISTS component_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE checkout_idempotency_requests ADD COLUMN IF NOT EXISTS request_hash TEXT NOT NULL DEFAULT '';

UPDATE checkout_orders SET receipt_code = 'O-' || LPAD(id::text, 5, '0') WHERE receipt_code IS NULL;
UPDATE checkout_return_receipts SET receipt_code = 'R-' || LPAD(id::text, 5, '0') WHERE receipt_code IS NULL;
UPDATE checkout_order_items items
   SET component_name_snapshot = components.name,
       component_image_url_snapshot = components.image_url,
       component_image_alt_snapshot = components.image_alt,
       component_category_snapshot = components.category
  FROM checkout_components components
 WHERE items.component_id = components.id AND items.component_name_snapshot = '';
UPDATE checkout_return_items items
   SET component_name_snapshot = components.name
  FROM checkout_components components
 WHERE items.component_id = components.id AND items.component_name_snapshot = '';
UPDATE checkout_components
   SET active = FALSE
 WHERE active = TRUE AND (image_url = '' OR image_alt = '');
