-- ============================================================
-- Migration 005 — Audit log table
-- Records every admin write action for accountability.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED     NULL     COMMENT 'users.id of the actor (NULL = system)',
    username     VARCHAR(80)      NULL     COMMENT 'Snapshot of username at the time',
    action       VARCHAR(80)      NOT NULL COMMENT 'e.g. teacher.create, teacher.remove.approve',
    entity_type  VARCHAR(60)      NULL     COMMENT 'e.g. teacher, document, vested_school',
    entity_id    INT UNSIGNED     NULL     COMMENT 'PK of the affected row',
    detail       JSON             NULL     COMMENT 'Contextual payload (sanitised — no passwords)',
    ip_address   VARCHAR(45)      NULL,
    created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_al_user       (user_id),
    INDEX idx_al_action     (action),
    INDEX idx_al_entity     (entity_type, entity_id),
    INDEX idx_al_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
