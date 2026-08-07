-- CreateTable
CREATE TABLE "Habitacion" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "precioBase" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Habitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Huesped" (
    "id" SERIAL NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,

    CONSTRAINT "Huesped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" SERIAL NOT NULL,
    "fechaCheckIn" TIMESTAMP(3) NOT NULL,
    "fechaCheckOut" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "precioTotal" DOUBLE PRECISION NOT NULL,
    "habitacionId" INTEGER NOT NULL,
    "huespedId" INTEGER NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Habitacion_numero_key" ON "Habitacion"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Huesped_email_key" ON "Huesped"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Huesped_tipoDocumento_numeroDocumento_key" ON "Huesped"("tipoDocumento", "numeroDocumento");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_habitacionId_fkey" FOREIGN KEY ("habitacionId") REFERENCES "Habitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_huespedId_fkey" FOREIGN KEY ("huespedId") REFERENCES "Huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
