/*
  Warnings:

  - You are about to drop the `Configuracion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `usuario` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[hotelId,numero]` on the table `Habitacion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[hotelId,numeroDocumento]` on the table `Huesped` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `hotelId` to the `Gasto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hotelId` to the `Habitacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hotelId` to the `Huesped` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hotelId` to the `Reserva` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Habitacion_numero_key";

-- DropIndex
DROP INDEX "Huesped_email_key";

-- DropIndex
DROP INDEX "Huesped_tipoDocumento_numeroDocumento_key";

-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN     "hotelId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Habitacion" ADD COLUMN     "hotelId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Huesped" ADD COLUMN     "hotelId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "hotelId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Configuracion";

-- DropTable
DROP TABLE "usuario";

-- CreateTable
CREATE TABLE "Hotel" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "horaCheckIn" TEXT NOT NULL DEFAULT '13:00',
    "horaCheckOut" TEXT NOT NULL DEFAULT '12:00',
    "ivaPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 19.0,
    "logoUrl" TEXT,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "hotelId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'Recepcionista',

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Habitacion_hotelId_numero_key" ON "Habitacion"("hotelId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Huesped_hotelId_numeroDocumento_key" ON "Huesped"("hotelId", "numeroDocumento");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habitacion" ADD CONSTRAINT "Habitacion_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Huesped" ADD CONSTRAINT "Huesped_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
