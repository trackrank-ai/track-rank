CREATE TABLE workspace_brands (
 org_id TEXT NOT NULL,
 workspace_id TEXT NOT NULL,
 brand_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('own','client','competitor')),
 PRIMARY KEY(workspace_id,brand_id),
 FOREIGN KEY(org_id,workspace_id) REFERENCES workspaces(org_id,id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,brand_id) REFERENCES brands(org_id,id) ON DELETE CASCADE
);
INSERT INTO workspace_brands(org_id,workspace_id,brand_id,kind) SELECT w.org_id,w.id,w.brand_id,b.kind FROM workspaces w JOIN brands b ON b.org_id=w.org_id AND b.id=w.brand_id WHERE w.brand_id IS NOT NULL;
