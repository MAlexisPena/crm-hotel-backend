-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "detalleNoches" JSONB,
ADD COLUMN     "ivaMonto" DOUBLE PRECISION,
ADD COLUMN     "ivaPorcentaje" DOUBLE PRECISION,
ADD COLUMN     "nochesReservadas" INTEGER,
ADD COLUMN     "nombreTemporada" TEXT,
ADD COLUMN     "numeroFactura" INTEGER,
ADD COLUMN     "subtotalSinIva" DOUBLE PRECISION;
