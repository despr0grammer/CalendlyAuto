-- CreateTable
CREATE TABLE "prospectos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "empresa" TEXT NOT NULL DEFAULT '',
    "rubro" TEXT NOT NULL DEFAULT '',
    "notas" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "etapaActual" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaUltimoMensaje" DATETIME,
    "fechaRespuesta" DATETIME,
    "proximoMensaje" DATETIME,
    "totalMensajesEnviados" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "mensajes_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prospectoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL DEFAULT '',
    "contenido" TEXT NOT NULL DEFAULT '',
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mensajes_log_prospectoId_fkey" FOREIGN KEY ("prospectoId") REFERENCES "prospectos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "configuracion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "datos" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "prospectos_telefono_key" ON "prospectos"("telefono");
