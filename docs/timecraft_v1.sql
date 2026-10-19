-- =====================================================================
-- Time Craft · Versión 1 (MVP) · schema v4
-- Cronómetro compartido, cuotas diaria/semanal, alarma, dashboard
-- + el niño entra con usuario + PIN desde cualquier navegador, ve su
--   saldo y cronómetro, solicita empezar, pide tiempo extra y reporta
--   tareas para bonos.
-- Motor: PostgreSQL (Neon) con Drizzle. Importable en ChartDB.
-- =====================================================================
-- Cambios v3
--   - Better Auth maneja la identidad: tablas auth_* (sección 0).
--   - users -> parents (sin email ni password_hash). Las columnas
--     *_by_user_id pasan a *_by_parent_id.
--   - children sin username ni pin_hash (viven en Better Auth).
--   - Sin vinculación de dispositivos: auth_session (user_agent, ip)
--     es el registro de dónde está logueado cada uno.
--   - push_subscriptions con un solo dueño: auth_user_id.
--   - session_alerts.provider_message_id (QStash) y tipo auto_close.
--   - Cierre automático: families.auto_close_after_minutes y
--     sessions.end_reason = 'auto_closed'.
--   - Un solo reporte pendiente por niño y tarea.
--   - Login de padres con Google (auth_account con provider_id 'google',
--     sin cambios de tablas) + código de recuperación por familia
--     (families.recovery_code_hash).
-- Cambios v4
--   - Aprobar y empezar ahora, o aprobar y programar el inicio: sesión
--     'scheduled' con scheduled_start_at; QStash la arranca a esa hora
--     (session_alerts.alert_type = 'start'). Un padre puede adelantarla
--     o cancelarla (status 'cancelled').
-- =====================================================================
-- Regla de permisos
--   El niño solo LEE o PIDE. Todo lo que da tiempo o inicia una sesión
--   lo aprueba un padre. Por eso toda FK hacia parents = "un padre".
--   Excepciones del niño: cancelar su propia solicitud pendiente.
--
-- Cálculo del disponible (no se guarda, se calcula):
--   bonos_semana = mín(suma de task_reports aprobados en la semana,
--                      weekly_bonus_cap_minutes)
--   disponible   = mín(daily_limit_minutes - consumido_hoy,
--                      weekly_limit_minutes + bonos_semana - consumido_semana)
--   (+ extra_minutes del override, solo para la sesión que lo usa)
--   Solo cuentan sesiones con started_at (las programadas o canceladas no consumen).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. IDENTIDAD (Better Auth)
-- ---------------------------------------------------------------------
-- Referencia para ChartDB. La versión definitiva la genera el CLI de
-- Better Auth (adapter Drizzle) dentro de packages/db. Los nombres se
-- mapean con modelName/fields: evita "user" (palabra reservada en
-- Postgres) y deja todo en snake_case. Better Auth usa ids TEXT.

-- Una fila por persona que inicia sesión (padre o niño).
-- Que sea padre o niño lo dice la tabla de dominio que la referencia.
CREATE TABLE auth_user (
    id                  TEXT PRIMARY KEY,
    name                TEXT        NOT NULL,
    email               TEXT        NOT NULL,              -- niño: correo sintético usuario@hijos.timecraft.local
    email_verified      BOOLEAN     NOT NULL DEFAULT false,
    image               TEXT,
    username            TEXT,                              -- plugin username, único global (login del niño)
    display_username    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_auth_user_email UNIQUE (email),
    CONSTRAINT uq_auth_user_username UNIQUE (username)
);

-- Sesiones de login. Hace de registro de dispositivos: un padre puede
-- ver dónde está logueado el niño y cerrar esa sesión.
CREATE TABLE auth_session (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT        NOT NULL,
    token               TEXT        NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    ip_address          TEXT,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_auth_session_token UNIQUE (token),
    CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES auth_user (id) ON DELETE CASCADE
);

-- Credenciales. provider_id = 'credential' para correo/usuario + contraseña,
-- 'google' para el login de padres con Google.
-- password guarda el hash (contraseña del padre o PIN del niño).
CREATE TABLE auth_account (
    id                          TEXT PRIMARY KEY,
    user_id                     TEXT        NOT NULL,
    account_id                  TEXT        NOT NULL,
    provider_id                 TEXT        NOT NULL,
    password                    TEXT,
    access_token                TEXT,
    refresh_token               TEXT,
    id_token                    TEXT,
    access_token_expires_at     TIMESTAMPTZ,
    refresh_token_expires_at    TIMESTAMPTZ,
    scope                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_auth_account_user FOREIGN KEY (user_id) REFERENCES auth_user (id) ON DELETE CASCADE
);

CREATE TABLE auth_verification (
    id                  TEXT PRIMARY KEY,
    identifier          TEXT        NOT NULL,
    value               TEXT        NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate limit en base de datos (en serverless la memoria no sirve).
-- No se limpia solo: borrar filas viejas de vez en cuando.
CREATE TABLE auth_rate_limit (
    id                  TEXT PRIMARY KEY,
    key                 TEXT        NOT NULL,
    count               INTEGER     NOT NULL,
    last_request        BIGINT      NOT NULL,
    CONSTRAINT uq_auth_rate_limit_key UNIQUE (key)
);

-- ---------------------------------------------------------------------
-- 1. QUIÉN
-- ---------------------------------------------------------------------

-- Hogar: agrupa a ambos padres y al/los hijos
CREATE TABLE families (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR(100) NOT NULL,
    timezone                    VARCHAR(64)  NOT NULL DEFAULT 'America/Guayaquil',
    week_start_day              SMALLINT     NOT NULL DEFAULT 1,  -- 0 = domingo, 1 = lunes ... 6 = sábado
    request_expiry_minutes      INTEGER      NOT NULL DEFAULT 15, -- una solicitud del niño sin respuesta expira
    auto_close_after_minutes    INTEGER      NOT NULL DEFAULT 30, -- si nadie detiene la sesión, el servidor la cierra este tiempo después del fin
    recovery_code_hash          TEXT,                             -- código de recuperación de un solo uso (último recurso si ambos padres pierden acceso)
    recovery_code_created_at    TIMESTAMPTZ,                      -- al usarlo se genera uno nuevo
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_families_week_start CHECK (week_start_day BETWEEN 0 AND 6),
    CONSTRAINT chk_families_expiry CHECK (request_expiry_minutes > 0),
    CONSTRAINT chk_families_auto_close CHECK (auto_close_after_minutes > 0)
);

-- Padres (administran todo). Su login vive en auth_user.
CREATE TABLE parents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id       UUID         NOT NULL,
    auth_user_id    TEXT         NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_parents_auth_user UNIQUE (auth_user_id),
    CONSTRAINT fk_parents_family FOREIGN KEY (family_id) REFERENCES families (id),
    CONSTRAINT fk_parents_auth_user FOREIGN KEY (auth_user_id) REFERENCES auth_user (id)
);

-- Hijo(s): entran con usuario + PIN desde cualquier navegador.
-- La cuenta la crea un padre (no hay registro público).
-- El bloqueo por intentos se aplica con hooks de Better Auth, además
-- del rate limit por IP.
CREATE TABLE children (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id             UUID         NOT NULL,
    auth_user_id          TEXT         NOT NULL,
    name                  VARCHAR(100) NOT NULL,
    avatar                VARCHAR(60),
    failed_pin_attempts   SMALLINT     NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_children_auth_user UNIQUE (auth_user_id),
    CONSTRAINT fk_children_family FOREIGN KEY (family_id) REFERENCES families (id),
    CONSTRAINT fk_children_auth_user FOREIGN KEY (auth_user_id) REFERENCES auth_user (id)
);

-- Actividades que consumen cuota (versión 1: Juego y TV)
CREATE TABLE activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id       UUID         NOT NULL,
    code            VARCHAR(30)  NOT NULL, -- 'game', 'tv'
    name            VARCHAR(60)  NOT NULL, -- 'Juego', 'TV'
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    CONSTRAINT uq_activities_family_code UNIQUE (family_id, code),
    CONSTRAINT fk_activities_family FOREIGN KEY (family_id) REFERENCES families (id)
);

-- ---------------------------------------------------------------------
-- 2. REGLAS
-- ---------------------------------------------------------------------

-- Límites diario y semanal, con historial (valid_from / valid_to)
-- activity_id NULL = cuota global (juego + TV comparten la misma bolsa)
CREATE TABLE quota_policies (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id                  UUID        NOT NULL,
    activity_id               UUID,
    daily_limit_minutes       INTEGER     NOT NULL,
    weekly_limit_minutes      INTEGER     NOT NULL,
    weekly_bonus_cap_minutes  INTEGER     NOT NULL DEFAULT 60,    -- tope de bonos ganados por semana
    carry_over_excess         BOOLEAN     NOT NULL DEFAULT false, -- el exceso se descuenta del día siguiente
    warning_minutes           INTEGER     NOT NULL DEFAULT 5,     -- aviso previo
    valid_from                TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to                  TIMESTAMPTZ,                        -- NULL = vigente
    created_by_parent_id      UUID        NOT NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_quota_limits CHECK (daily_limit_minutes > 0 AND weekly_limit_minutes >= daily_limit_minutes),
    CONSTRAINT chk_quota_bonus_cap CHECK (weekly_bonus_cap_minutes >= 0),
    CONSTRAINT chk_quota_warning CHECK (warning_minutes >= 0),
    CONSTRAINT fk_quota_child FOREIGN KEY (child_id) REFERENCES children (id),
    CONSTRAINT fk_quota_activity FOREIGN KEY (activity_id) REFERENCES activities (id),
    CONSTRAINT fk_quota_created_by FOREIGN KEY (created_by_parent_id) REFERENCES parents (id)
);

-- ---------------------------------------------------------------------
-- 3. SOLICITUDES DEL NIÑO
-- ---------------------------------------------------------------------

-- Lo que el niño pide y un padre resuelve desde su teléfono
--   start      = "quiero empezar" (actividad + minutos)
--   extra_time = "quiero tiempo extra" (con motivo obligatorio, solo con cuota agotada)
-- Al aprobar se crea la sesión (y el override si es extra_time) en la
-- misma transacción; esas filas apuntan aquí con request_id.
-- Expiración perezosa: una fila pending con expires_at vencido se marca
-- 'expired' al leerla o antes de crear otra (si no, el índice de
-- "una pendiente por niño" bloquea la nueva).
CREATE TABLE child_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id                UUID        NOT NULL,
    request_type            VARCHAR(20) NOT NULL,                   -- start | extra_time
    activity_id             UUID        NOT NULL,
    requested_minutes       INTEGER     NOT NULL,
    reason                  TEXT,                                   -- obligatorio en extra_time
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired | cancelled
    approved_minutes        INTEGER,                                -- el padre puede aprobar menos de lo pedido
    response_note           VARCHAR(200),                           -- ej. "después de la cena"
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at              TIMESTAMPTZ NOT NULL,                   -- created_at + families.request_expiry_minutes
    resolved_by_parent_id   UUID,
    resolved_at             TIMESTAMPTZ,
    CONSTRAINT chk_requests_type CHECK (request_type IN ('start', 'extra_time')),
    CONSTRAINT chk_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
    CONSTRAINT chk_requests_minutes CHECK (requested_minutes > 0),
    CONSTRAINT chk_requests_reason CHECK (request_type <> 'extra_time' OR length(trim(coalesce(reason, ''))) > 0),
    CONSTRAINT chk_requests_approved CHECK (
        (status = 'approved' AND approved_minutes > 0) OR (status <> 'approved' AND approved_minutes IS NULL)
    ),
    CONSTRAINT chk_requests_resolver CHECK (status NOT IN ('approved', 'rejected') OR resolved_by_parent_id IS NOT NULL),
    CONSTRAINT fk_requests_child FOREIGN KEY (child_id) REFERENCES children (id),
    CONSTRAINT fk_requests_activity FOREIGN KEY (activity_id) REFERENCES activities (id),
    CONSTRAINT fk_requests_resolved_by FOREIGN KEY (resolved_by_parent_id) REFERENCES parents (id)
);

-- Override: tiempo extra autorizado por un padre con cuota agotada.
-- Nace de una solicitud extra_time del niño o directo del padre (request_id NULL).
-- Siempre se usa en una sesión nueva (no extiende la que está corriendo).
CREATE TABLE quota_overrides (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id              UUID        NOT NULL,
    request_id            UUID,
    granted_by_parent_id  UUID        NOT NULL,
    extra_minutes         INTEGER     NOT NULL,
    reason                TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_override_request UNIQUE (request_id),
    CONSTRAINT chk_override_minutes CHECK (extra_minutes > 0),
    CONSTRAINT chk_override_reason CHECK (length(trim(reason)) > 0),
    CONSTRAINT fk_override_child FOREIGN KEY (child_id) REFERENCES children (id),
    CONSTRAINT fk_override_request FOREIGN KEY (request_id) REFERENCES child_requests (id),
    CONSTRAINT fk_override_granted_by FOREIGN KEY (granted_by_parent_id) REFERENCES parents (id)
);

-- ---------------------------------------------------------------------
-- 4. CRONÓMETRO
-- ---------------------------------------------------------------------

-- Sesión de pantalla. La crea siempre un padre: directo o al aprobar
-- una solicitud del niño (request_id). El niño la ve en vivo, solo lectura.
-- Dos formas de empezar:
--   ahora     -> status 'running', started_at = now()
--   más tarde -> status 'scheduled', scheduled_start_at = hora elegida
--                (como máximo hasta el final del día). QStash la pasa a
--                'running' a esa hora; un padre puede adelantarla o
--                cancelarla ('cancelled'). Al arrancar, la duración se
--                recorta al disponible de ese momento; si es 0, se cancela.
-- Estados: scheduled -> running <-> paused -> finished
--          scheduled -> cancelled
--   completed    = un padre la detuvo al llegar o pasar el fin
--   stopped_early = un padre la detuvo antes del fin
--   auto_closed  = nadie la detuvo; el servidor la cerró en
--                  fin + families.auto_close_after_minutes
--                  (consumed_seconds = planned + ese margen)
CREATE TABLE sessions (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id                  UUID        NOT NULL,
    activity_id               UUID        NOT NULL,
    request_id                UUID,                        -- si nació de una solicitud del niño
    override_id               UUID,                        -- si se inició por override
    status                    VARCHAR(20) NOT NULL,        -- scheduled | running | paused | finished | cancelled
    scheduled_start_at        TIMESTAMPTZ,                 -- solo si se programó para más tarde
    started_at                TIMESTAMPTZ,                 -- NULL mientras está programada o si se canceló antes de empezar
    planned_duration_seconds  INTEGER     NOT NULL,        -- propuesta = disponible (+ override), nunca más
    ended_at                  TIMESTAMPTZ,
    end_reason                VARCHAR(20),                 -- completed | stopped_early | auto_closed
    consumed_seconds          INTEGER,                     -- tiempo real (incluye exceso), se fija al cerrar
    started_by_parent_id      UUID        NOT NULL,
    ended_by_parent_id        UUID,                        -- quien la detuvo o canceló; NULL solo si auto_closed
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sessions_request UNIQUE (request_id),
    CONSTRAINT chk_sessions_status CHECK (status IN ('scheduled', 'running', 'paused', 'finished', 'cancelled')),
    CONSTRAINT chk_sessions_end_reason CHECK (end_reason IS NULL OR end_reason IN ('completed', 'stopped_early', 'auto_closed')),
    CONSTRAINT chk_sessions_planned CHECK (planned_duration_seconds > 0),
    CONSTRAINT chk_sessions_start CHECK (
        (status = 'scheduled' AND scheduled_start_at IS NOT NULL AND started_at IS NULL)
        OR (status IN ('running', 'paused', 'finished') AND started_at IS NOT NULL)
        OR (status = 'cancelled' AND started_at IS NULL AND scheduled_start_at IS NOT NULL)
    ),
    CONSTRAINT chk_sessions_end CHECK (
        (status = 'finished' AND ended_at IS NOT NULL AND end_reason IS NOT NULL AND consumed_seconds IS NOT NULL)
        OR (status = 'cancelled' AND ended_at IS NOT NULL AND ended_by_parent_id IS NOT NULL AND end_reason IS NULL AND consumed_seconds IS NULL)
        OR (status IN ('scheduled', 'running', 'paused') AND ended_at IS NULL AND end_reason IS NULL AND consumed_seconds IS NULL)
    ),
    CONSTRAINT chk_sessions_ender CHECK (end_reason IS NULL OR end_reason = 'auto_closed' OR ended_by_parent_id IS NOT NULL),
    CONSTRAINT fk_sessions_child FOREIGN KEY (child_id) REFERENCES children (id),
    CONSTRAINT fk_sessions_activity FOREIGN KEY (activity_id) REFERENCES activities (id),
    CONSTRAINT fk_sessions_request FOREIGN KEY (request_id) REFERENCES child_requests (id),
    CONSTRAINT fk_sessions_override FOREIGN KEY (override_id) REFERENCES quota_overrides (id),
    CONSTRAINT fk_sessions_started_by FOREIGN KEY (started_by_parent_id) REFERENCES parents (id),
    CONSTRAINT fk_sessions_ended_by FOREIGN KEY (ended_by_parent_id) REFERENCES parents (id)
);

-- Pausas (ej. la comida): no consumen cuota. Solo las hace un padre.
CREATE TABLE session_pauses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID        NOT NULL,
    paused_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    resumed_at              TIMESTAMPTZ,                   -- NULL = pausa en curso
    paused_by_parent_id     UUID        NOT NULL,
    resumed_by_parent_id    UUID,
    reason                  VARCHAR(120),
    CONSTRAINT chk_pauses_order CHECK (resumed_at IS NULL OR resumed_at >= paused_at),
    CONSTRAINT fk_pauses_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_pauses_paused_by FOREIGN KEY (paused_by_parent_id) REFERENCES parents (id),
    CONSTRAINT fk_pauses_resumed_by FOREIGN KEY (resumed_by_parent_id) REFERENCES parents (id)
);

-- Trabajos programados con QStash (mensaje con notBefore).
--   start      = arranca una sesión programada y avisa "¡ya puedes empezar!"
--   warning    = push de aviso previo a padres y niño
--   end        = push de fin a padres y niño
--   auto_close = el servidor cierra la sesión y avisa a los padres
-- Al adelantar o cancelar una sesión programada se cancela su 'start'.
-- Al pausar: se cancelan en QStash (por provider_message_id) y se marca
-- cancelled_at. Al reanudar: filas nuevas con la hora recalculada.
-- El endpoint que recibe QStash es idempotente: verifica la firma, y no
-- hace nada si sent_at o cancelled_at ya tienen valor o si la sesión no
-- está en el estado esperado (QStash reintenta).
CREATE TABLE session_alerts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL,
    alert_type            VARCHAR(20)  NOT NULL,           -- start | warning | end | auto_close
    scheduled_at          TIMESTAMPTZ  NOT NULL,
    provider_message_id   VARCHAR(100),                    -- id del mensaje en QStash, para cancelarlo
    sent_at               TIMESTAMPTZ,
    cancelled_at          TIMESTAMPTZ,
    CONSTRAINT chk_alerts_type CHECK (alert_type IN ('start', 'warning', 'end', 'auto_close')),
    CONSTRAINT chk_alerts_final CHECK (sent_at IS NULL OR cancelled_at IS NULL),
    CONSTRAINT fk_alerts_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 5. BONOS POR TAREAS
-- ---------------------------------------------------------------------

-- Catálogo de tareas que dan minutos, definido por los padres
CREATE TABLE bonus_tasks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id               UUID         NOT NULL,
    name                    VARCHAR(80)  NOT NULL,         -- 'Deberes', 'Leer 20 min', 'Práctica de robótica'
    description             VARCHAR(255),
    reward_minutes          INTEGER      NOT NULL,
    max_per_week            SMALLINT,                      -- NULL = sin límite de veces (el tope en minutos sigue)
    is_active               BOOLEAN      NOT NULL DEFAULT true,
    created_by_parent_id    UUID         NOT NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_bonus_reward CHECK (reward_minutes > 0),
    CONSTRAINT chk_bonus_max CHECK (max_per_week IS NULL OR max_per_week > 0),
    CONSTRAINT fk_bonus_family FOREIGN KEY (family_id) REFERENCES families (id),
    CONSTRAINT fk_bonus_created_by FOREIGN KEY (created_by_parent_id) REFERENCES parents (id)
);

-- El niño reporta una tarea hecha; un padre la valida.
-- awarded_minutes se fija al aprobar (copia de reward_minutes, o ajustado).
CREATE TABLE task_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id                UUID        NOT NULL,
    bonus_task_id           UUID        NOT NULL,
    note                    VARCHAR(200),                  -- lo que escribe el niño
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    awarded_minutes         INTEGER,
    review_note             VARCHAR(200),
    reported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by_parent_id   UUID,
    reviewed_at             TIMESTAMPTZ,
    CONSTRAINT chk_reports_status CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT chk_reports_awarded CHECK (
        (status = 'approved' AND awarded_minutes > 0) OR (status <> 'approved' AND awarded_minutes IS NULL)
    ),
    CONSTRAINT chk_reports_reviewer CHECK (status = 'pending' OR reviewed_by_parent_id IS NOT NULL),
    CONSTRAINT fk_reports_child FOREIGN KEY (child_id) REFERENCES children (id),
    CONSTRAINT fk_reports_task FOREIGN KEY (bonus_task_id) REFERENCES bonus_tasks (id),
    CONSTRAINT fk_reports_reviewed_by FOREIGN KEY (reviewed_by_parent_id) REFERENCES parents (id)
);

-- ---------------------------------------------------------------------
-- 6. AVISOS
-- ---------------------------------------------------------------------

-- Suscripciones Web Push, de cualquier persona logueada (padre o niño).
-- Destinatarios de un aviso: los auth_user_id de los padres de la
-- familia y el del niño.
CREATE TABLE push_subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id          TEXT         NOT NULL,
    endpoint              TEXT         NOT NULL,
    p256dh_key            TEXT         NOT NULL,
    auth_key              TEXT         NOT NULL,
    device_label          VARCHAR(100),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at          TIMESTAMPTZ,
    CONSTRAINT uq_push_endpoint UNIQUE (endpoint),
    CONSTRAINT fk_push_auth_user FOREIGN KEY (auth_user_id) REFERENCES auth_user (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
CREATE INDEX idx_auth_session_user ON auth_session (user_id);
CREATE INDEX idx_auth_account_user ON auth_account (user_id);
CREATE INDEX idx_parents_family ON parents (family_id);
CREATE INDEX idx_children_family ON children (family_id);
CREATE INDEX idx_sessions_child_started ON sessions (child_id, started_at);
CREATE INDEX idx_sessions_status ON sessions (status);
CREATE INDEX idx_pauses_session ON session_pauses (session_id);
CREATE INDEX idx_alerts_session ON session_alerts (session_id);
CREATE INDEX idx_quota_child ON quota_policies (child_id, valid_from);
CREATE INDEX idx_overrides_child ON quota_overrides (child_id, created_at);
CREATE INDEX idx_requests_child_status ON child_requests (child_id, status);
CREATE INDEX idx_reports_child_reported ON task_reports (child_id, reported_at);
CREATE INDEX idx_reports_status ON task_reports (status);
CREATE INDEX idx_push_auth_user ON push_subscriptions (auth_user_id);

-- ---------------------------------------------------------------------
-- Reglas que conviene aplicar en la BD real (Drizzle / migración),
-- no hacen falta para visualizar en ChartDB:
--
-- Una sola sesión programada o activa por hijo a la vez:
--   CREATE UNIQUE INDEX uq_sessions_one_active
--     ON sessions (child_id) WHERE status IN ('scheduled', 'running', 'paused');
--
-- Una sola pausa en curso por sesión:
--   CREATE UNIQUE INDEX uq_pauses_one_open
--     ON session_pauses (session_id) WHERE resumed_at IS NULL;
--
-- Una sola política vigente por hijo y actividad:
--   CREATE UNIQUE INDEX uq_quota_current
--     ON quota_policies (child_id, COALESCE(activity_id, '00000000-0000-0000-0000-000000000000'::uuid))
--     WHERE valid_to IS NULL;
--
-- Una sola solicitud pendiente por niño (evita que insista 10 veces):
--   CREATE UNIQUE INDEX uq_requests_one_pending
--     ON child_requests (child_id) WHERE status = 'pending';
--
-- Un solo reporte pendiente por niño y tarea:
--   CREATE UNIQUE INDEX uq_reports_one_pending
--     ON task_reports (child_id, bonus_task_id) WHERE status = 'pending';
--
-- Un auth_user no puede ser padre y niño a la vez: se valida en la app
-- (caso de uso de creación de cuentas).
-- ---------------------------------------------------------------------
