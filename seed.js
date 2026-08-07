const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {

  // Encriptar las contraseñas
  const passGerente = await bcrypt.hash('gerente123', 10);
  const passRecep = await bcrypt.hash('recep123', 10);

  // Crear el Gerente
  await prisma.usuario.upsert({

    where: { email: 'gerente@hotel.com' },
    update: { password: passGerente },
    create: {

      nombre: 'Pepito Pérez',
      email: 'gerente@hotel.com',
      password: passGerente,
      rol: 'Gerente'

    }
  });

  // Crear el Recepcionista
  await prisma.usuario.upsert({

    where: { email: 'recepcion@hotel.com' },
    update: { password: passRecep },
    create: {

      nombre: 'Ana Pancracia',
      email: 'recepcion@hotel.com',
      password: passRecep,
      rol: 'Recepcionista'

    }
  });

  console.log('✅ Usuarios creados/actualizados exitosamente');

  // Borrar gastos (mientras prueba)
  await prisma.Gasto.deleteMany({});

  // Crear gastos del mes actual
  await prisma.Gasto.createMany({

    data: [

      { concepto: 'Nómina Recepción y Limpieza', monto: 250000, categoria: 'Nomina' }

    ]
  });

  console.log('💸 Gastos registrados exitosamente');

    // Configuración inicial del hotel
  await prisma.configuracion.upsert({

    where: { id: 1 },
    update: {},
    create: { horaCheckIn: "13:00", horaCheckOut: "12:00" }

  });
  
  console.log('⚙️ Configuración de hotel creada');
  
}


main().catch(e => console.error(e)).finally(() => prisma.$disconnect());