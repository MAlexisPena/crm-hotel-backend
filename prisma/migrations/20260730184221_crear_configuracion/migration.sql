-- CreateTable
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "horaCheckIn" TEXT NOT NULL DEFAULT '13:00',
    "horaCheckOut" TEXT NOT NULL DEFAULT '12:00',

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);
