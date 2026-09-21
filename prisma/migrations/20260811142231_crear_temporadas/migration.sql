-- CreateTable
CREATE TABLE "Temporada" (
    "id" SERIAL NOT NULL,
    "hotelId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "diasAplicables" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',

    CONSTRAINT "Temporada_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Temporada" ADD CONSTRAINT "Temporada_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
