// Importar herramientas
const express = require('express'); // El framework para crear el servidor
const { PrismaClient } = require('@prisma/client'); // El puente hacia la base de datos
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'hotel_crm_secreto_super_seguro_2024';

// Inicializar herramientas
const app = express(); // Creamos la aplicación de Express
const prisma = new PrismaClient(); // Creamos la conexión con Prisma

// Middleware (Configuración vital)
app.use(express.json()); // Esto le dice a Express: "Por favor, entiende los datos que me envíen en formato JSON"

app.use(cors());

// Crear nuestra primera Ruta (API)
// Cuando alguien entre a la URL principal, responderá
app.get('/', (req, res) => {
    res.send('¡El servidor del CRM Hotelerío está corriendo!');
});

//-------------------------------------------------------------------------------------------------

// Ruta de LOGIN (Autenticación)
app.post('/api/auth/login', async (req, res) => {

  try {

    const { email, password } = req.body;

    // 1. Buscamos el usuario por email
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (!usuario) {

      return res.status(400).json({ error: 'Credenciales incorrectas' });

    }

    // 2. Comparamos la contraseña enviada con la encriptada en la BD
    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido) {

      return res.status(400).json({ error: 'Credenciales incorrectas' });

    }

    // 3. Generamos el Token de seguridad (vence en 8 horas)
    const token = jwt.sign(

      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      JWT_SECRET,
      { expiresIn: '8h' }

    );

    // 4. Enviamos el token y los datos del usuario (SIN la contraseña)
    res.json({

      token,
      usuario: {

        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol

      }

    });

  } catch (error) {

    res.status(500).json({ error: 'Error en el login', detalle: error.message });

  }
});

// ------------------------------------------------------------------------------------------------

// Ruta del DASHBOARD FINANCIERO Y OPERATIVO
// Ruta del DASHBOARD FINANCIERO (Con rango de fechas)
app.get('/api/dashboard', async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    let fechaInicio, fechaFin;

    // Validamos que el formato sea YYYY-MM-DD
    if (inicio && fin && /^\d{4}-\d{2}-\d{2}$/.test(inicio) && /^\d{4}-\d{2}-\d{2}$/.test(fin)) {

      const [y1, m1, d1] = inicio.split('-').map(Number);
      fechaInicio = new Date(y1, m1 - 1, d1, 0, 0, 0, 0);
      const [y2, m2, d2] = fin.split('-').map(Number);
      fechaFin = new Date(y2, m2 - 1, d2, 23, 59, 59, 999); // Hasta el último segundo del día

    } else {

      // Si no hay fechas, mostramos el mes actual
      const hoy = new Date();
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
      
    }

    const [ingresosMes, egresosMes, totalHabitaciones, habitacionesOcupadas, habitacionesDisponibles, tarifas, topHuespedes] = await Promise.all([
      prisma.reserva.aggregate({

        _sum: { precioTotal: true },
        where: { fechaCheckOut: { gte: fechaInicio, lte: fechaFin }, estado: 'Finalizada' }

      }),

      prisma.gasto.aggregate({

        _sum: { monto: true },
        where: { fecha: { gte: fechaInicio, lte: fechaFin } }

      }),

      prisma.habitacion.count(),
      prisma.habitacion.count({ where: { estado: 'Ocupada' } }),
      prisma.habitacion.count({ where: { estado: 'Disponible' } }),
      prisma.habitacion.findMany({ select: { precioBase: true } }),
      prisma.huesped.findMany({

        include: { _count: { select: { reservas: true } } },
        orderBy: { reservas: { _count: 'desc' } },
        take: 5

      })

    ]);

    const porcentajeOcupacion = totalHabitaciones > 0 ? (habitacionesOcupadas / totalHabitaciones) * 100 : 0;
    const adr = tarifas.length > 0 ? tarifas.reduce((sum, h) => sum + h.precioBase, 0) / tarifas.length : 0;
    const totalIngresos = ingresosMes._sum.precioTotal || 0;
    const totalEgresos = egresosMes._sum.monto || 0;
    const utilidadEstimada = totalIngresos - totalEgresos;
    const diasPeriodo = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
    const revPAR = totalHabitaciones > 0 ? totalIngresos / (totalHabitaciones * diasPeriodo) : 0;

    res.json({

      kpis: {

        totalIngresos, totalEgresos, utilidadEstimada,
        porcentajeOcupacion: Math.round(porcentajeOcupacion),
        habitacionesDisponibles, habitacionesOcupadas,
        adr: Math.round(adr), revPAR: Math.round(revPAR)
      },

      topHuespedes: topHuespedes.map(h => ({

        nombre: `${h.nombre} ${h.apellido}`,
        documento: h.numeroDocumento,
        totalReservas: h._count.reservas

      }))

    });

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener dashboard', detalle: error.message });

  }
  
});

// ------------------------------------------------------------------------------------------------

// Ruta para REGISTRAR un nuevo gasto (Solo Gerente)
app.post('/api/gastos', async (req, res) => {

  try {

    const { concepto, monto, categoria, estado } = req.body;
    const nuevoGasto = await prisma.gasto.create({

      data: {

        concepto,
        monto: parseFloat(monto),
        categoria,
        estado: estado || 'Pagado'

      }

    });

    res.status(201).json(nuevoGasto);

  } catch (error) {

    res.status(500).json({ error: 'Error al registrar gasto', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para obtener alertas de pagos PENDIENTES
app.get('/api/gastos/pendientes', async (req, res) => {

  try {

    const gastos = await prisma.gasto.findMany({ 

      where: { estado: 'Pendiente' },
      orderBy: { fecha: 'desc' }

    });

    res.json(gastos);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener gastos', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para MARCAR un gasto como PAGADO
app.put('/api/gastos/:id/pagar', async (req, res) => {

  try {

    const { id } = req.params;
    const gastoActualizado = await prisma.gasto.update({

      where: { id: parseInt(id) },
      data: { estado: 'Pagado' }

    });

    res.json(gastoActualizado);

  } catch (error) {

    res.status(500).json({ error: 'Error al actualizar el gasto', detalle: error.message });

  }
  
});

// ------------------------------------------------------------------------------------------------

// Ruta para buscar habitaciones disponibles en un rango de fechas
app.get('/api/habitaciones/disponibles', async (req, res) => {

    try {

        // Leer las fechas de la URL: ?checkIn=2024-12-10&chekOut=2024-12-15
        const { checkIn, checkOut } = req.query;

        if (!checkIn || !checkOut) {

            return res.status(400).json({ error: 'Debes proporcionar checkIn y checkOut0' });
        };

        const fechaCheckIn = new Date(checkIn);
        const fechaCheckOut = new Date(checkOut);

        const habitacionesDisponibles = await prisma.habitacion.findMany({

            where: {

                // Condición principal: La habitación NO debe tener reservas que se crucen
                reservas: {

                    none: {

                        AND: [

                            // 1. La reserva existente empieza ANTES de que nosotros salgamos
                            { fechaCheckIn: { lt: fechaCheckOut } },

                            // 2. La reserva existente termina después de que nosotros entremos
                            { fechaCheckOut: { gt: fechaCheckIn } }
                        ]
                    }
                }
            }
        });

        res.json(habitacionesDisponibles);

    } catch (error) {

        res.status(500).json({ error: 'Error al buscar disponibilidad', detalle: error.message });
    }
});

// ------------------------------------------------------------------------------------------------

// Creamos una ruta para VER las habitaciones (Conectando Express con Prisma)
app.get('/api/habitaciones', async (req, res) => {

  try {
    
        const habitaciones = await prisma.habitacion.findMany({

        include: {

            // Traemos la última reserva (que es la activa si está Ocupada)
            reservas: {
                
            include: { huesped: true }, // Del huésped traemos todos sus datos
            orderBy: { id: 'desc' },    // Ordenamos de la más nueva a la más vieja
            take: 1                     // Solo traemos 1 (la actual)

            }
        },

        orderBy: { id: 'asc' } // Las ordenamos por ID

        });

        res.json(habitaciones);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener las habitaciones', detalle: error.message });

  }
});

// ------------------------------------------------------------------------------------------

// Ruta para CREAR una nueva habitación
app.post('/api/habitaciones', async (req, res) => {

  try {

    // Extraemos los datos que nos envía el cliente desde el cuerpo de la petición (req.body)
    const { numero, tipo, precioBase, estado } = req.body;

    // Pedir a Prisma que cree una nueva habitación en la base de datos
    const nuevaHabitacion = await prisma.habitacion.create({

    data: {

        numero: numero,
        tipo: tipo,
        precioBase: parseFloat(precioBase), // Aseguramos que sea un número decimal
        estado: estado || 'Disponible'

    }
    });

    // Responder con el objeto creado y un código 201 (Creado exitosamente)
    res.status(201).json(nuevaHabitacion);

  } catch (error) {

    // Si hay un error (ej: el número de habitación ya existe), lo capturamos
    res.status(500).json({ error: 'Error al crear la habitación', detalle: error.message });

  }
});

// ------------------------------------------------------------------------------------------------

// Ruta para ACTUALIZAR el estado de una habitación
app.put('/api/habitaciones/:id', async (req, res) => {

    try {

        const { id } = req.params; // Obtener el ID de la URL
        const { estado } = req.body; // Obtener el nuevo estado del cuerpo de petición

        const habitacionActualizada = await prisma.habitacion.update({

            where: { id: parseInt(id) }, // Buscar habitación por su ID
            data: { estado } // Acutalizar solo el campo estado

        });

        res.json(habitacionActualizada);

    } catch (error) {

        res.status(500).json({ error: 'Error al actualizar la habitación', detalle: error.message });

    }
});

// -------------------------------------------------------------------------------------------

// Ruta para CREAR un nuevo huésped
app.post('/api/huespedes', async (req, res) => {

    try {

        // Extraemos los datos del huésped desde el cuerpo de la petición
        const { tipoDocumento, numeroDocumento, nombre, apellido, email, telefono } = req.body;

        // Pedir a prisma que cree el huésped en la base de datos
        const nuevoHuesped = await prisma.huesped.create({

            data: {

                tipoDocumento,
                numeroDocumento,
                nombre,
                apellido,
                email,
                telefono,

            }

        });

        // Responder con el objeto creado
        res.status(201).json(nuevoHuesped);

    } catch (error){

        // Si el email o docuemnto ya existen, la base de datos arrojará un error
        res.status(500).json({ error: 'Error al crear el huésped', detalle: error.message });

    }
});

// -------------------------------------------------------------------------------------------

// Ruta para ACTUALIZAR LAS NOTAS de un huésped
app.put('/api/huespedes/:id/notas', async (req, res) => {

  try {

    const { id } = req.params;
    const { notas } = req.body;

    const huespedActualizado = await prisma.huesped.update({
      
      where: { id: parseInt(id) },
      data: { notas }

    });

    res.json(huespedActualizado);

  } catch (error) {

    res.status(500).json({ error: 'Error al guardar la nota', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para OBTENER TODAS las reservas con sus relaciones
app.get('/api/reservas', async (req, res) => {

    try {

        const reservas = await prisma.reserva.findMany({

            include: {

                huesped: true,
                habitacion: true

            },
            orderBy: {

                fechaCheckIn: 'desc'

            }
        });

        res.json(reservas);

    } catch (error) {

        res.status(500).json({ error: 'Error al obtener las reservas', detalle: error.message });

    }
});

// ------------------------------------------------------------------------------------------------

// Ruta para OBTENER SALIDAS DE HOY (Departures)
app.get('/api/reservas/salidas-hoy', async (req, res) => {

  try {
  
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);

    const reservas = await prisma.reserva.findMany({

      where: {

        fechaCheckOut: { gte: inicioHoy, lte: finHoy },
        estado: 'En Casa'

      },

      include: { huesped: true, habitacion: true },
      orderBy: { fechaCheckOut: 'asc' }
      
    });

    res.json(reservas);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener salidas', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para HACER CHECK-IN MÁGICO desde una reserva
app.put('/api/reservas/:id/checkin', async (req, res) => {

  try {

    const { id } = req.params;

    // 1. Buscamos la reserva
    const reserva = await prisma.reserva.findUnique({

      where: { id: parseInt(id) },
      include: { habitacion: true }

    });

    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (reserva.estado === 'En Casa') return res.status(400).json({ error: 'El huésped ya hizo check-in' });

    // 2. Cambiamos la habitación a Ocupada
    await prisma.habitacion.update({

      where: { id: reserva.habitacionId },
      data: { estado: 'Ocupada' }

    });

    // 3. Cambiamos el estado de la reserva a "En Casa" y registramos la entrada real
    const reservaActualizada = await prisma.reserva.update({

      where: { id: parseInt(id) },
      data: { 

        estado: 'En Casa',
        fechaCheckIn: new Date() // Hora exacta en la que llegó

      }

    });

    res.json({ mensaje: 'Check-in realizado con éxito', reserva: reservaActualizada });

  } catch (error) {

    res.status(500).json({ error: 'Error en check-in mágico', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para BUSCAR huéspedes (Buscador avanzado)
app.get('/api/huespedes', async (req, res) => {

  try {

    const { q } = req.query; // 'q' es el texto de búsqueda

    // Si hay texto de búsqueda, filtramos. Si no, traemos a todos.
    const huespedes = await prisma.huesped.findMany({

      where: q ? {

        OR: [

          { nombre: { contains: q, mode: 'insensitive' } },     // Busca por nombre
          { apellido: { contains: q, mode: 'insensitive' } },   // Busca por apellido
          { numeroDocumento: { contains: q } },                 // Busca por documento
          { email: { contains: q, mode: 'insensitive' } }       // Busca por email

        ]

      } : {},

      include: {

        reservas: {

          where: { estado: { not: 'Cancelada' } }, // EXCLUIMOS CANCELADAS
          include: { habitacion: true },
          orderBy: { fechaCheckIn: 'desc' }

        }

      },

      orderBy: { apellido: 'asc' } // Ordenamos alfabéticamente

    });

    res.json(huespedes);

  } catch (error) {

    res.status(500).json({ error: 'Error al buscar huéspedes', detalle: error.message });

  }
  
});

// ------------------------------------------------------------------------------------------------

// Ruta para OBTENER UN huésped por su ID específico (con historial filtrado)
app.get('/api/huespedes/:id', async (req, res) => {

  try {

    const { id } = req.params;

    const huesped = await prisma.huesped.findUnique({

      where: { id: parseInt(id) },
      include: {

        reservas: {
          // EXCLUIMOS CANCELADAS para que no ensucien el historial
          where: { estado: { not: 'Cancelada' } }, 
          orderBy: { fechaCheckIn: 'desc' }

        }

      }

    });

    // Manejo de error si el huésped no existe
    if (!huesped) {

      return res.status(404).json({ error: 'Huésped no encontrado' });

    }

    res.json(huesped);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener el huésped', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para hacer CHECK-IN
app.post('/api/checkin', async (req, res) => {

  try {

    const { habitacionId, tipoDocumento, numeroDocumento, nombre, apellido, email, telefono, fechaCheckOut, descuento } = req.body;

    const hoy = new Date();
    const fechaSalidaCheck = fechaCheckOut ? new Date(fechaCheckOut) : new Date(new Date().setDate(hoy.getDate() + 1));
    
    const conflicto = await prisma.reserva.findFirst({

      where: {

        habitacionId: parseInt(habitacionId),
        estado: { not: 'Cancelada' },
        AND: [

          { fechaCheckIn: { lt: fechaSalidaCheck } },
          { fechaCheckOut: { gt: hoy } }

        ]

      }

    });

    if (conflicto) {

      return res.status(400).json({ error: 'No se puede hacer reservar. La habitación tiene una reserva futura.' });

    }

    const resultado = await prisma.$transaction(async (prisma) => {

      let huesped = await prisma.huesped.findFirst({

        where: { tipoDocumento, numeroDocumento }

      });

      if (!huesped) {

        huesped = await prisma.huesped.create({

          data: { tipoDocumento, numeroDocumento, nombre, apellido, email, telefono: telefono || null }

        });

      }

      // Cálculo matemático de noches y precio
      const hoy = new Date();
      let fechaSalida;
      if (fechaCheckOut) {

        const [y, m, d] = fechaCheckOut.split('-').map(Number);
        fechaSalida = new Date(y, m - 1, d, 12, 0, 0);

      } else {

        fechaSalida = new Date(new Date().setDate(hoy.getDate() + 1));

      }

      let diffTime = Math.abs(fechaSalida - hoy);
      let noches = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (noches === 0) noches = 1;

      const habitacion = await prisma.habitacion.findUnique({ where: { id: parseInt(habitacionId) } });
      let precioTotal = noches * habitacion.precioBase;
      
      // Aplicar descuento si existe
      if (descuento && !isNaN(parseFloat(descuento))) {

        precioTotal -= parseFloat(descuento);

      }

      if (precioTotal < 0) precioTotal = 0;

      await prisma.reserva.create({

        data: {

          habitacionId: parseInt(habitacionId),
          huespedId: huesped.id,
          fechaCheckIn: hoy,
          fechaCheckOut: fechaSalida,
          precioTotal,
          estado: 'En Casa'

        }

      });

      const habitacionActualizada = await prisma.habitacion.update({

        where: { id: parseInt(habitacionId) },
        data: { estado: 'Ocupada' }

      });

      return habitacionActualizada;

    });

    res.json(resultado);

  } catch (error) {

    res.status(500).json({ error: 'Error al realizar el Check-in', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para crear una RESERVA FUTURA
app.post('/api/reservas', async (req, res) => {

  try {

    const { habitacionId, fechaCheckIn, fechaCheckOut, tipoDocumento, numeroDocumento, nombre, apellido, email, telefono, descuento, estado } = req.body;

    // 1. Validar Anti-Overbooking
    const conflicto = await prisma.reserva.findFirst({

      where: {

        habitacionId: parseInt(habitacionId),
        estado: { not: 'Cancelada' },
        AND: [

          { fechaCheckIn: { lt: new Date(fechaCheckOut) } },
          { fechaCheckOut: { gt: new Date(fechaCheckIn) } }

        ]

      }

    });

    if (conflicto) {

      return res.status(400).json({ error: 'La habitación ya esta reservada.' });

    }

    // 2. Buscar o crear Huésped
    let huesped = await prisma.huesped.findFirst({

      where: { tipoDocumento, numeroDocumento }

    });

    if (!huesped) {

      huesped = await prisma.huesped.create({

        data: { tipoDocumento, numeroDocumento, nombre, apellido, email, telefono: telefono || null }

      });

    }

    // 3. Calcular noches, precio y descuento
    // Truco anti-bug de zona horaria: Separamos la fecha y la creamos a las 12 PM local
    const [ciY, ciM, ciD] = fechaCheckIn.split('-').map(Number);
    const checkInDate = new Date(ciY, ciM - 1, ciD, 12, 0, 0);
    
    const [coY, coM, coD] = fechaCheckOut.split('-').map(Number);
    const checkOutDate = new Date(coY, coM - 1, coD, 12, 0, 0);

    const diffTime = Math.abs(checkOutDate - checkInDate);
    let noches = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (noches === 0) noches = 1;

    const habitacion = await prisma.habitacion.findUnique({ where: { id: parseInt(habitacionId) } });
    let precioTotal = noches * habitacion.precioBase;

    // Aplicar descuento
    if (descuento && !isNaN(parseFloat(descuento))) {

      precioTotal -= parseFloat(descuento);

    }

    if (precioTotal < 0) precioTotal = 0;

    // Si el estado es "En Casa", la fecha real de entrada es AHORA mismo
    let finalCheckInDate = checkInDate;
    if (estado === 'En Casa') {

      finalCheckInDate = new Date();

    }

    // 4. Crear la reserva
    const nuevaReserva = await prisma.reserva.create({

      data: {

        habitacionId: parseInt(habitacionId),
        huespedId: huesped.id,
        fechaCheckIn: checkInDate,
        fechaCheckOut: checkOutDate,
        precioTotal,
        estado: estado || 'Pendiente'

      }

    });

    // Si es "En Casa", cambiamos la habitación a Ocupada
    if (estado === 'En Casa') {

      await prisma.habitacion.update({

        where: { id: parseInt(habitacionId) },
        data: { estado: 'Ocupada' }

      });

    }

    res.status(201).json(nuevaReserva);

  } catch (error) {

    res.status(500).json({ error: 'Error al crear la reserva', detalle: error.message });

  }

});

// Ruta para OBTENER RESERVAS DE HOY (Llegadas)
app.get('/api/reservas/hoy', async (req, res) => {

  try {

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);

    const reservas = await prisma.reserva.findMany({

      where: {

        fechaCheckIn: { gte: inicioHoy, lte: finHoy },
        estado: { in: ['Confirmada', 'Pendiente'] }

      },
      include: { huesped: true, habitacion: true },
      orderBy: { fechaCheckIn: 'desc' }

    });

    res.json(reservas);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener reservas de hoy', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para ACTUALIZAR ESTADO de una reserva (Confirmar Pendiente)
app.put('/api/reservas/:id/estado', async (req, res) => {

  try {

    const { id } = req.params;
    const { estado } = req.body;

    const reservaActualizada = await prisma.reserva.update({

      where: { id: parseInt(id) },
      data: { estado }

    });

    res.json(reservaActualizada);

  } catch (error) {

    res.status(500).json({ error: 'Error al actualizar estado', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para OBTENER TODAS LAS RESERVAS (Para el listado)
app.get('/api/reservas', async (req, res) => {

  try {

    const reservas = await prisma.reserva.findMany({

      include: { huesped: true, habitacion: true },
      orderBy: { fechaCheckIn: 'asc' }

    });

    res.json(reservas);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener reservas', detalle: error.message });

  }

});

//-------------------------------------------------------------------------------------------------

// Ruta para CANCELAR una reserva de forma SEGURA
app.put('/api/reservas/:id/cancelar', async (req, res) => {

  try {

    const { id } = req.params;
    const { email, password, motivo } = req.body;

    // 1. Autenticar al usuario que está intentando cancelar
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (!usuario) {

      return res.status(403).json({ error: 'Usuario no autorizado.' });

    }

    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido) {

      return res.status(403).json({ error: 'Contraseña incorrecta. No se pudo cancelar.' });

    }

    // 2. Cambiar estado de la reserva a Cancelada
    const reservaCancelada = await prisma.reserva.update({

      where: { id: parseInt(id) },
      data: { estado: 'Cancelada' }

    });

    res.json({ mensaje: 'Reserva cancelada con éxito', reserva: reservaCancelada });

  } catch (error) {

    res.status(500).json({ error: 'Error al cancelar la reserva', detalle: error.message });

  }

});

// ------------------------------------------------------------------------------------------------

// Ruta para buscar huésped por documento
app.get('/api/huespedes/documento/:numeroDocumento', async (req, res) => {

  try {

    const { numeroDocumento } = req.params;

    const huesped = await prisma.huesped.findFirst({

      where: { numeroDocumento: numeroDocumento }

    });

    if (huesped) {

      res.json(huesped);

    } else {

      res.status(404).json({ mensaje: "No encontrado" })

    }

  } catch (error) {

    res.status(500).json({ error: 'Error al buscar el documento', detalle: error.message });

  }
});

// Ruta para hacer CHECK-OUT y FACTURAR (Actualizada)
app.put('/api/checkout/:id', async (req, res) => {

  try {

    const { id } = req.params;

    const resultado = await prisma.$transaction(async (prisma) => {

      // Buscar la habitación y su reserva activa (la última creada)
      const habitacion = await prisma.habitacion.findUnique({

        where: { id: parseInt(id) },
        include: {

          reservas: {

            include: { huesped: true },
            orderBy: { id: 'desc' },
            take: 1

          }
        }
      });

      if (!habitacion || habitacion.reservas.length === 0) {

        throw new Error('No hay reserva activa para facturar.');

      }

      const reserva = habitacion.reservas[0];

      // Calcular noches (Diferencia entre entrada y salida)
      const checkInDate = new Date(reserva.fechaCheckIn);
      const checkOutDate = new Date(); // Momento exacto del check-out
      
      // Math.ceil redondea hacia arriba (ej: 1.2 días = 2 noches)
      const diffTime = Math.abs(checkOutDate - checkInDate);
      let noches = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (noches === 0) noches = 1; // Mínimo se cobra 1 noche

      // 3. Calcular Dinero
      const precioPorNoche = habitacion.precioBase;
      const subtotal = noches * precioPorNoche;
      const iva = subtotal * 0.19; // 19% IVA Colombia
      const total = subtotal + iva;

      // 4. Actualizar la reserva con el cobro real y la fecha real de salida
      await prisma.reserva.update({

        where: { id: reserva.id },
        data: {

          fechaCheckOut: checkOutDate,
          precioTotal: total,
          estado: 'Finalizada'

        }
      });

      // 5. Cambiar habitación a Limpieza
      const habitacionActualizada = await prisma.habitacion.update({

        where: { id: parseInt(id) },
        data: { estado: 'Limpieza' }

      });

      // 6. Retornar la factura
      return {

        habitacion: habitacionActualizada,
        factura: {

          huesped: reserva.huesped,
          numeroHabitacion: habitacion.numero,
          fechaCheckIn: reserva.fechaCheckIn,
          fechaCheckOut: checkOutDate,
          noches,
          precioPorNoche,
          subtotal,
          iva,
          total

        }
      };
    });

    res.json(resultado);

  } catch (error) {

    res.status(500).json({ error: 'Error al facturar', detalle: error.message });

  }
});

// Ruta para obtener la configuración del hotel
app.get('/api/configuracion', async (req, res) => {

  try {

    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    res.json(config);

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener configuración' });

  }

});

// ------------------------------------------------------------------------------------------------

// Levantamos el servidor para que escuche peticiones
const PORT = process.env.PORT || 3000; // Puerto por defecto 3000, pero puede ser configurado en .env

app.listen(PORT, () => {

    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);

});

