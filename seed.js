const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {

  // 1. Creamos el Primer Hotel
    const hotel = await prisma.hotel.upsert({

    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      nombre: "Hotel Prueba",
      razonSocial: "Hotel Prueba S.A.S",
      nit: "900.123.456-7",
      direccion: "Cra 1 # 2-3",
      ciudad: "Bogotá D.C.",           
      departamento: "Bogotá D.C", 
      pais: "Colombia",           
      telefono: "5551234",
      moneda: "COP",
      horaCheckIn: "13:00",
      horaCheckOut: "12:00",
      ivaPorcentaje: 19.0

    }
    
  });

  console.log('✅ Hotel creado:', hotel.nombre);

  // 2. Encriptamos las contraseñas
  const passGerente = await bcrypt.hash('gerente123', 10);
  const passRecep = await bcrypt.hash('recep123', 10);
  const passGeHotelDay = await bcrypt.hash('hotelday123', 10);

  // 3. Creamos los Usuarios (Agregando hotelId: 1)
  await prisma.usuario.upsert({

    where: { email: 'gerente@hotelprueba.com' },
    update: { password: passGerente, hotelId: 1 },
    create: { 

      nombre: 'Gerente General',
      email: 'gerente@hotelprueba.com', 
      password: passGerente, 
      rol: 'Gerente', 
      hotelId: 1 

    }

  });

  await prisma.usuario.upsert({

    where: { email: 'recepcion@hotel.com' },
    update: { password: passRecep, hotelId: 1 },
    create: { 
      
      nombre: 'Ana Recepcionista', 
      email: 'recepcion@hotel.com', 
      password: passRecep, 
      rol: 'Recepcionista', 
      hotelId: 1 
    
    }

  });

    await prisma.usuario.upsert({

    where: { email: 'gerente@hotelday.com' },
    update: { password: passGeHotelDay, hotelId: 2 },
    create: { 

      nombre: 'Gerente Hotel Day',
      email: 'gerente@hotelday.com', 
      password: passGeHotelDay, 
      rol: 'Gerente', 
      hotelId: 2 

    }

  });

  console.log('✅ Usuarios creados');

  // 4. Borramos gastos viejos y creamos nuevos (Agregando hotelId: 1)
  await prisma.gasto.deleteMany({});
  await prisma.gasto.createMany({

    data: [

      { concepto: 'Nómina Recepción', monto: 2500000, categoria: 'Nomina', estado: 'Pagado', hotelId: 1 },
      { concepto: 'Servicios Públicos', monto: 850000, categoria: 'Servicios', estado: 'Pendiente', hotelId: 1 }

    ]

  });

  console.log('💸 Gastos registrados exitosamente');

}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());