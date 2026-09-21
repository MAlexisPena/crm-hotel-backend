require('dotenv').config();

// Importar herramientas
const express = require('express'); // El framework para crear el servidor
const { PrismaClient } = require('@prisma/client'); // El puente hacia la base de datos
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Inicializamos Prisma y Express
const prisma = new PrismaClient(); // Inicializamos Prisma
const app = express(); // Inicializamos Express

// COmfiguración CORS Crítica para Cookies entre Vercel y Render
const allowedOrigins = [

  'http://localhost:5173',
  'https://crm-hotel-frontend.vercel.app/'

];

app.use(cors({

  origin: function (origin, callback) {

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {

      callback(null, true);

    } else {

      callback(new Error('No permitido por CORS'));

    }
  },
  credentials: true 

})); // Permitir que cualquier cliente pueda conectarse

app.use(express.json()); // Para entender los datos en formato JSON
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {

  console.error('❌ ERROR FATAL: JWT_SECRET no está definido en las variables de entorno.');
  process.exit(1);

}


// Middleware de autenticación
function authMiddleware(req, res, next) {

  // 1. Intentar leer el token desde la cookie
  let token = req.cookies.token;

  // 2. Fallback: Si no hay cookie, intentamos leerlo del header Authorization
  if (!token && req.headers['authorization']) {

    token = req.headers['authorization'].split(' ')[1];

  }

  if (!token) return res.status(401).json({ error: 'No hay token' });

  try {

    const decoded = jwt.verify(token, JWT_SECRET);
    req.hotelId = decoded.hotelId; // Guardamos el hotelId en la solicitud
    req.userId = decoded.id; // Guardamos el userId en la solicitud
    req.rol =  decoded.rol; // Guardamos el rol en la solicitud
    next();

  } catch (error) {

    return res.status(403).json({ error: 'Token inválido o expirado' });

  }
}

// Middleware de autorización por rol: solo pasa el Gerente
function soloGerente(req, res, next) {

  if (req.rol !== 'Gerente') {
    return res.status(403).json({ error: 'Acceso exclusivo del Gerente' });
  }

  next(); // Es Gerente: puede pasar

}

//-------------------------------------------------------------------------------------------------

// Ruta de LOGIN (Autenticación)
app.post('/api/auth/login', async (req, res) => {

  try {

    const { email, password } = req.body;

    // 1. Buscamos el usuario por email y traemos su hotelId
    const usuario = await prisma.usuario.findUnique({ 

      where: { email },
      include: { hotel: true } // Incluimos el hotel para obtener su ID
    
    });

    if (!usuario) return res.status(400).json({ error: 'Credenciales incorrectas' });

    // 2. Comparamos la contraseña enviada con la encriptada en la BD
    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) return res.status(400).json({ error: 'Credenciales incorrectas' });

    // 3. Generamos el Token de seguridad (vence en 8 horas)
    const token = jwt.sign(

      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, hotelId: usuario.hotelId },
      JWT_SECRET,
      { expiresIn: '8h' }

    );

    // 4. Opciones de la Cookie HttpOnly
    const cookieOptions = {

      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000

    };

    // 5. Enviamos la cookie
    res.cookie('token', token, cookieOptions);

    // 6. Respondemos solo los datos del usuario
    res.json({

      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, hotelId: usuario.hotelId},
      hotel: { 

        id: usuario.hotel.id, nombre: usuario.hotel.nombre, razonSocial: usuario.hotel.razonSocial, nit: usuario.hotel.nit,
        direccion: usuario.hotel.direccion, ciudad: usuario.hotel.ciudad, departamento: usuario.hotel.departamento, pais: usuario.hotel.pais,
        telefono: usuario.hotel.telefono, moneda: usuario.hotel.moneda, horaCheckIn: usuario.hotel.horaCheckIn, horaCheckOut: usuario.hotel.horaCheckOut 
        
      }

    });

  } catch (error) {

    res.status(500).json({ error: 'Error en el login' });

  }
});

// Ruta de LOGOUT
app.post('/api/auth/logout', (req, res) => {

  const cookieOptions = {

    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'

  };

  res.clearCookie('token', cookieOptions);
  res.json({ mensaje: 'Sesión cerrada exitosamente'});

});

// Ruta de Verificación de sesión al recargar (F5)
app.get('/api/auth/me', authMiddleware, async (req, res) => {

  try {

    const usuario = await prisma.usuario.findUnique( {

      where: { id: req.userId },
      include: { hotel: true }

    });

    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({

      usuario: {

        id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, hotelId: usuario.hotel

      },
      hotel: {

        id: usuario.hotel.id, nombre: usuario.hotel.nombre, razonSocial: usuario.hotel.razonSocial, nit: usuario.hotel.nit,
        direccion: usuario.hotel.direccion, ciudad: usuario.hotel.ciudad, departamento: usuario.hotel.departamento, pais: usuario.hotel.pais,
        telefono: usuario.hotel.telefono, moneda: usuario.hotel.moneda, horaCheckIn: usuario.hotel.horaCheckIn, horaCheckOut: usuario.hotel.horaCheckOut

      }
    });

  } catch (error) {

    res.status(500).json({ error: 'Error al obtener usuario' });

  }
});

// ------------------------------------------------------------------------------------------------

// Todas las rutas que requieren autenticación deben usar el middleware authMiddleware
app.use(authMiddleware);

// === MOTOR DE PRECIOS DINÁMICOS ===
// Función matemática pura
async function calcularPrecioReserva(hotelId, habitacionId, fechaCheckIn, fechaFin, descuento) {

  const habitacion = await prisma.habitacion.findFirst({ 
    where: { id: habitacionId, hotelId: hotelId }
  });
  if (!habitacion) throw new Error('Habitación no encontrada');

  const temporadas = await prisma.temporada.findMany({ where: { hotelId } });

  // Función para parsear fechas de forma segura
  const parseSafeDate = (dateStr) => {

    if (dateStr instanceof Date) return dateStr;
    if (!dateStr) return new Date(); // Si viene vacío, usa hoy
    
    // Si viene con 'T' (formato ISO), tomamos solo la parte de la fecha
    const cleanStr = typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr;
    const [y, m, d] = cleanStr.split('-').map(Number);
    
    // Si se pudo extraer año, mes y día, creamos la fecha local
    if (y && m && d) return new Date(y, m - 1, d, 0, 0, 0, 0);
    
    return new Date(dateStr); // Fallback
    
  };

  // Preparamos las fechas a medianoche para evitar errores de horas
  const inicio = parseSafeDate(fechaCheckIn);
  const fin = parseSafeDate(fechaFin)

  let noches = 0;
  let subtotal = 0;
  let current = new Date(inicio);

  // Iteramos noche por noche
  while (current < fin) {

    noches++;
    let precioNoche = habitacion.precioBase; // Precio base por defecto
    let diaSemana = current.getDay().toString(); // 0=Domingo, 6=Sabado

    // Revisamos si la noche actual cae en alguna temporada
    for (let temp of temporadas) {

      let tempInicio = parseSafeDate(temp.fechaInicio);
      let tempFin = parseSafeDate(temp.fechaFin);
      tempFin.setHours(23, 59, 59, 999);
      let diasAplicables = temp.diasAplicables.split(',');

      // Si la fecha está en el rango Y el día de la semana aplica
      if (current >= tempInicio && current <= tempFin && diasAplicables.includes(diaSemana)) {

        // Aplicamos el porcentaje (ej: 20% -> multiplica por 1.20)
        precioNoche = habitacion.precioBase * (1 + (temp.porcentaje / 100));
        break; // Si hay varias temporadas, aplicamos la primera que coincida

      }

    }

    subtotal += precioNoche;
    current.setDate(current.getDate() + 1); // Pasamos al siguiente día

  }

  if (noches === 0) noches = 1; // Mínimo 1 noche
  let total = subtotal;
  if (descuento && !isNaN(parseFloat(descuento))) {

    total -= parseFloat(descuento);

  }

  if (total < 0) total = 0;

  return { noches, subtotal, total };

}

// Ruta para que el Frontend simule el precio en tiempo real
app.post('/api/calcular-precio', async (req, res) => {

  try {

    const { habitacionId, fechaCheckIn, fechaCheckOut, descuento } = req.body;
    if (!fechaCheckIn || !fechaCheckOut) return res.json({ noches: 0, subtotal: 0, total: 0 });
    
    const resultado = await calcularPrecioReserva(req.hotelId, parseInt(habitacionId), fechaCheckIn, fechaCheckOut, descuento);
    res.json(resultado);

  } catch (error) {

    res.status(500).json({ error: 'Error al calcular precio', detalle: error.message });

  }

});

// === HABITACIONES ===
// Ruta para OBTENER TODAS las habitaciones de un hotel específico
app.get('/api/habitaciones', async (req, res) => {

  const habitaciones = await prisma.habitacion.findMany({

    where: { hotelId: req.hotelId },
    include: { reservas: { include: { huesped: true }, orderBy: { id: 'desc' }, take: 1 } },
    orderBy: { id: 'asc' }

  });

  res.json(habitaciones);

});

// Ruta para CREAR una nueva habitación en un hotel específico
app.post('/api/habitaciones', async (req, res) => {

  try {

    const { numero, tipo, precioBase, estado } = req.body;

    const nuevaHabitacion = await prisma.habitacion.create({

      data: { 
        
        numero, tipo, precioBase: parseFloat(precioBase), estado: estado || "Disponible", hotelId: req.hotelId

      }

    });

    res.status(201).json(nuevaHabitacion);
 
  } catch (error) {

    res.status(500).json({ error: 'Error al crear la habitación', detalle: error.message });
  }
  

});

// Ruta para ACTUALIZAR el estado de una habitación en un hotel específico
app.put('/api/habitaciones/:id', async (req, res) => {

  try {

    const { id } = req.params;
    const { estado } = req.body;

    // updateMany solo toca si la habitación es de ESTE hotel
    const resultado = await prisma.habitacion.updateMany({

      where: { id: parseInt(id), hotelId: req.hotelId },
      data: { estado }

    });

    if (resultado.count === 0) {
      return res.status(404).json({ error: 'Habitación no encontrada' });
    }

    res.json({ mensaje: 'Estado actualizado' });

  } catch (error) {

    res.status(500).json({ error: 'Error al actualizar la habitación' });

  }

});

// Ruta para OBTENER habitaciones disponibles en un rango de fechas
app.get('/api/habitaciones/disponibles', async (req, res) => {

  const { checkIn, checkOut } = req.query;
  if (!checkIn || !checkOut) return res.status(400).json({ error: 'Debes proporcionar checkIn y checkOut' });

  const disponibles = await prisma.habitacion.findMany({

    where: {

      hotelId: req.hotelId,
      reservas: {

        none: {

          AND: [

            { fechaCheckIn: { lt: new Date(checkOut) } },
            { fechaCheckOut: { gt: new Date(checkIn) } }
          
          ]
        }
      }
    }
  });

  res.json(disponibles);

});


// === HUESPEDES ===
// Ruta para OBTENER todos los huéspedes de un hotel específico
app.get('/api/huespedes', async (req, res) => {

  try {

    const { q } = req.query;
    
    // Construimos el filtro de forma segura
    const whereClause = { hotelId: req.hotelId };
    if (q) {

      whereClause.OR = [

        { nombre: { contains: q, mode: 'insensitive' } },
        { apellido: { contains: q, mode: 'insensitive' } },
        { numeroDocumento: { contains: q } }

      ];
    }

    const huespedes = await prisma.huesped.findMany({

      where: whereClause,
      include: { _count: { select: { reservas: true } } },
      orderBy: { apellido: 'asc' }

    });

    res.json(huespedes);

  } catch (error) {

    res.status(500).json({ error: 'Error al buscar huéspedes', detalle: error.message });

  }
});

// Ruta para OBTENER un huésped específico por su número de documento
app.get('/api/huespedes/:numeroDocumento', async (req, res) => {

  const huesped = await prisma.huesped.findFirst({

    where: { hotelId: req.hotelId, numeroDocumento: req.params.numeroDocumento }

  });

  if (!huesped) return res.status(404).json({ error: 'Huesped no encontrado' });

  res.json(huesped);

});

// Ruta para ACTUALIZAR una nota para un huésped específico
app.put('/api/huespedes/:id/notas', async (req, res) => {

  try {

    const { notas } = req.body;

    const resultado = await prisma.huesped.updateMany({

      where: { id: parseInt(req.params.id), hotelId: req.hotelId },
      data: { notas }

    });

    if (resultado.count === 0) {
      return res.status(404).json({ error: 'Huésped no encontrado' });
    }

    res.json({ mensaje: 'Nota guardada' });

  } catch (error) {

    res.status(500).json({ error: 'Error al guardar la nota' });

  }

});

// === RESERVAS Y CHECK-IN ===
// Ruta para HACER CHECK-IN (creando reserva y actualizando estado de habitación)
app.post('/api/checkin', async (req, res) => {

  try {

    const { habitacionId, tipoDocumento, numeroDocumento, nombre, apellido, email, telefono, fechaCheckOut, descuento } = req.body;

    // Anti-overbooking: Verificamos si la habitación ya tiene una reserva futura
    const conflicto = await prisma.reserva.findFirst({

      where: {

        habitacionId: parseInt(habitacionId),
        hotelId: req.hotelId,
        estado: { not: 'Cancelada' },
        AND: [

          { fechaCheckIn: { lt: fechaCheckOut ? new Date(fechaCheckOut) : new Date() } },
          { fechaCheckOut: { gt: new Date() } }
        
        ]
      }
    });

    if (conflicto) return res.status(400).json({ error: 'Overbooking: La habitación tiene una reserva futura.' });

    // Buscamos o creamos el huésped
    let huesped = await prisma.huesped.findFirst({

      where: { hotelId: req.hotelId, numeroDocumento }

    });

    if (!huesped) {

      huesped = await prisma.huesped.create({

        data: { tipoDocumento, numeroDocumento, nombre, apellido, email, telefono: telefono, hotelId: req.hotelId }

      });
    }

    // Calculamos noches y precio total
    const hoy = new Date();
    let fechaSalida = fechaCheckOut ? new Date(fechaCheckOut) : new Date(new Date().setDate(hoy.getDate() + 1));
    const calc  = await calcularPrecioReserva(req.hotelId, parseInt(habitacionId), hoy, fechaSalida, descuento);

    await prisma.reserva.create({

      data: {

        habitacionId: parseInt(habitacionId), huespedId: huesped.id, fechaCheckIn: hoy, fechaCheckOut: fechaSalida, precioTotal: calc.total, estado: 'En Casa', hotelId: req.hotelId

      }
    });

    await prisma.habitacion.update({

      where: { id: parseInt(habitacionId) },
      data: { estado: 'Ocupada' }

    });

    res.json({ mensaje: 'Check-in realizado con éxito' });

  } catch (error) {

    res.status(500).json({ error: 'Error', detalle: error.message });

  }
});

// Ruta para HACER CHECK-OUT (finalizando reserva y actualizando estado de habitación)
app.put('/api/checkout/:id', async (req, res) => {

  try {

    const habitacion = await prisma.habitacion.findUnique({
      
      where: { id: parseInt(req.params.id) },
      include: { reservas: { where: { estado: 'En Casa' }, take: 1, include: { huesped: true } } }

    });

    if (!habitacion || habitacion.reservas.length === 0) throw new Error('No hay reserva activa');
    const reserva = habitacion.reservas[0];

    const noches = Math.max(1, Math.ceil((new Date() - new Date(reserva.fechaCheckIn)) / (1000 * 60 * 60 * 24)));
    const subtotal = noches * habitacion.precioBase;
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    await prisma.reserva.update({

      where: { id: reserva.id },
      data: { fechaCheckOut: new Date(), precioTotal: total, estado: 'Finalizada' }

    });

    await prisma.habitacion.update({

      where: { id: habitacion.id },
      data: { estado: 'Limpieza' }

    });

    res.json({

      factura: {

        huesped: reserva.huesped, numeroHabitacion: habitacion.numero,
        fechaCheckIn: reserva.fechaCheckIn, fechaCheckOut: new Date(),
        noches, precioPorNoche: habitacion.precioBase, subtotal, iva, total

      }

    });

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});

// Ruta para CREAR una nueva reserva (sin check-in)
// Ruta para crear una RESERVA FUTURA (Con fechas blindadas)
app.post('/api/reservas', async (req, res) => {
  try {
    const { habitacionId, fechaCheckIn, fechaCheckOut, tipoDocumento, numeroDocumento, nombre, apellido, email, telefono, descuento, estado } = req.body;

    // 1. PARSEO DE FECHAS (Blindado contra zona horaria)
    // Separamos la fecha y la creamos a las 12 PM local
    const [y1, m1, d1] = fechaCheckIn.split('-').map(Number);
    const checkInDate = new Date(y1, m1 - 1, d1, 12, 0, 0);
    
    const [y2, m2, d2] = fechaCheckOut.split('-').map(Number);
    const checkOutDate = new Date(y2, m2 - 1, d2, 12, 0, 0);

    // 2. Validar Anti-Overbooking (Usamos las fechas ya parseadas)
    const conflicto = await prisma.reserva.findFirst({
      where: {
        habitacionId: parseInt(habitacionId), 
        hotelId: req.hotelId,
        estado: { not: 'Cancelada' },
        AND: [
          { fechaCheckIn: { lt: checkOutDate } },
          { fechaCheckOut: { gt: checkInDate } }
        ]
      }
    });

    if (conflicto) return res.status(400).json({ error: 'Overbooking: La habitación no está disponible en esas fechas.' });

    // 3. Buscar o crear Huésped
    let huesped = await prisma.huesped.findFirst({ 
      where: { hotelId: req.hotelId, numeroDocumento } 
    });

    if (!huesped) {
      huesped = await prisma.huesped.create({
        data: { tipoDocumento, numeroDocumento, nombre, apellido, email, telefono, hotelId: req.hotelId }
      });
    }

    // 4. Calcular noches y precio (Usamos la calculadora inteligente)
    const calc = await calcularPrecioReserva(req.hotelId, parseInt(habitacionId), checkInDate, checkOutDate, descuento);
    const precioTotal = calc.total;

    // 5. Crear la reserva (Guardamos con las fechas parseadas)
    const nuevaReserva = await prisma.reserva.create({
      data: {
        habitacionId: parseInt(habitacionId), 
        huespedId: huesped.id,
        fechaCheckIn: checkInDate, 
        fechaCheckOut: checkOutDate,
        precioTotal, 
        estado: estado || 'Pendiente', 
        hotelId: req.hotelId
      }
    });

    // 6. Si es "En Casa", cambiamos la habitación a Ocupada
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

// Ruta para OBTENER todas las reservas de un hotel específico
app.get('/api/reservas', async (req, res) => {

  const reservas = await prisma.reserva.findMany({

    where: { hotelId: req.hotelId },
    include: { huesped: true, habitacion: true },
    orderBy: { fechaCheckIn: 'desc' }

  });

  res.json(reservas);

});

// Ruta para ACTUALIZAR el estado de una reserva específica
app.put('/api/reservas/:id/estado', async (req, res) => {

  try {

    const { estado } = req.body;

    const resultado = await prisma.reserva.updateMany({

      where: { id: parseInt(req.params.id), hotelId: req.hotelId },
      data: { estado }

    });

    if (resultado.count === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // Devolvemos la reserva ya actualizada (el frontend espera un objeto)
    const actualizada = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    res.json(actualizada);

  } catch (error) {

    res.status(500).json({ error: 'Error al actualizar la reserva' });

  }

});

// Ruta para HACER CHECK-IN de una reserva existente
app.put('/api/reservas/:id/checkin', async (req, res) => {

  const reserva = await prisma.reserva.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!reserva || reserva.hotelId !== req.hotelId) return res.status(404).json({ error: 'No encontrada' });
  
  await prisma.habitacion.update({ where: { id: reserva.habitacionId }, data: { estado: 'Ocupada' } });
  const actualizada = await prisma.reserva.update({

    where: { id: reserva.id },
    data: { estado: 'En Casa', fechaCheckIn: new Date() }

  });

  res.json(actualizada);

});

// Ruta para CANCELAR una reserva específica (requiere contraseña del usuario)
app.put('/api/reservas/:id/cancelar', async (req, res) => {

try {

    const { email, password } = req.body;

    // 1. ¿La reserva existe y pertenece a ESTE hotel?
    const reserva = await prisma.reserva.findFirst({

      where: { id: parseInt(req.params.id), hotelId: req.hotelId }

    });

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // 2. ¿Quién autoriza es un usuario de ESTE hotel y su contraseña es válida?
    const usuario = await prisma.usuario.findFirst({

      where: { email: email, hotelId: req.hotelId }

    });

    if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
      return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    // 3. Todo validado: cancelar
    await prisma.reserva.update({

      where: { id: reserva.id },
      data: { estado: 'Cancelada' }

    });

    res.json({ mensaje: 'Cancelada' });

  } catch (error) {

    res.status(500).json({ error: 'Error al cancelar la reserva' });

  }

});

// Ruta para OBTENER las reservas que tienen check-in hoy
app.get('/api/reservas/hoy', async (req, res) => {

  const inicio = new Date(); inicio.setHours(0,0,0,0);
  const fin = new Date(); fin.setHours(23,59,59,999);
  const reservas = await prisma.reserva.findMany({

    where: { hotelId: req.hotelId, fechaCheckIn: { gte: inicio, lte: fin }, estado: { in: ['Confirmada', 'Pendiente'] } },
    include: { huesped: true, habitacion: true }

  });

  res.json(reservas);

});

// Ruta para OBTENER las reservas que tienen check-out hoy
app.get('/api/reservas/salidas-hoy', async (req, res) => {

  const inicio = new Date(); inicio.setHours(0,0,0,0);
  const fin = new Date(); fin.setHours(23,59,59,999);
  const reservas = await prisma.reserva.findMany({

    where: { hotelId: req.hotelId, fechaCheckOut: { gte: inicio, lte: fin }, estado: 'En Casa' },
    include: { huesped: true, habitacion: true }

  });

  res.json(reservas);

});

// === DASHBOARD Y GASTOS ===
// Ruta para OBTENER KPIs y top huéspedes de un hotel específico
app.get('/api/dashboard', soloGerente, async (req, res) => {

  try {

    const { inicio, fin } = req.query;
    let fechaInicio, fechaFin;
    if (inicio && fin) {

      fechaInicio = new Date(inicio + 'T00:00:00');
      fechaFin = new Date(fin + 'T23:59:59');

    } else {

      const hoy = new Date();
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

    }

    const [ingresos, egresos, totalHab, habOcupadas, tarifas, topHuespedes] = await Promise.all([

      prisma.reserva.aggregate({ _sum: { precioTotal: true }, where: { hotelId: req.hotelId, estado: 'Finalizada', fechaCheckOut: { gte: fechaInicio, lte: fechaFin } } }),
      prisma.gasto.aggregate({ _sum: { monto: true }, where: { hotelId: req.hotelId, fecha: { gte: fechaInicio, lte: fechaFin } } }),
      prisma.habitacion.count({ where: { hotelId: req.hotelId } }),
      prisma.habitacion.count({ where: { hotelId: req.hotelId, estado: 'Ocupada' } }),
      prisma.habitacion.findMany({ where: { hotelId: req.hotelId }, select: { precioBase: true } }),
      prisma.huesped.findMany({ where: { hotelId: req.hotelId }, include: { _count: { select: { reservas: true } } }, orderBy: { reservas: { _count: 'desc' } }, take: 5 })

    ]);

    const totalIngresos = ingresos._sum.precioTotal || 0;
    const totalEgresos = egresos._sum.monto || 0;
    const adr = tarifas.length > 0 ? tarifas.reduce((s, h) => s + h.precioBase, 0) / tarifas.length : 0;
    const dias = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;

    res.json({

      kpis: {

        totalIngresos, totalEgresos, utilidadEstimada: totalIngresos - totalEgresos,
        porcentajeOcupacion: totalHab > 0 ? Math.round((habOcupadas / totalHab) * 100) : 0,
        habitacionesDisponibles: totalHab - habOcupadas, habitacionesOcupadas: habOcupadas,
        adr: Math.round(adr), revPAR: totalHab > 0 ? Math.round(totalIngresos / (totalHab * dias)) : 0

      },
      topHuespedes: topHuespedes.map(h => ({ nombre: `${h.nombre} ${h.apellido}`, totalReservas: h._count.reservas }))

    });

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});

// Ruta para CREAR un nuevo gasto (Agregando hotelId: req.hotelId)
app.post('/api/gastos', soloGerente, async (req, res) => {

  const { concepto, monto, categoria, estado } = req.body;
  const nuevo = await prisma.gasto.create({

    data: { concepto, monto: parseFloat(monto), categoria, estado, hotelId: req.hotelId }

  });

  res.status(201).json(nuevo);

});

// Ruta para OBTENER todos los gastos de un hotel específico
app.get('/api/gastos/pendientes', soloGerente, async (req, res) => {

  const gastos = await prisma.gasto.findMany({ where: { hotelId: req.hotelId, estado: 'Pendiente' } });
  res.json(gastos);

});

// Ruta para MARCAR un gasto como pagado
app.put('/api/gastos/:id/pagar', soloGerente, async (req, res) => {

  try {

    const resultado = await prisma.gasto.updateMany({

      where: { id: parseInt(req.params.id), hotelId: req.hotelId },
      data: { estado: 'Pagado' }

    });

    if (resultado.count === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json({ mensaje: 'Gasto pagado' });

  } catch (error) {

    res.status(500).json({ error: 'Error al pagar el gasto' });

  }

});

// === TEMPORADAS (PRECIOS DINÁMICOS) ===
// Ruta para buscar temporadas
app.get('/api/temporadas', async (req, res) => {

  const temps = await prisma.temporada.findMany({ where: { hotelId: req.hotelId }, orderBy: { fechaInicio: 'asc' } });
  res.json(temps);

});

// Ruta para crear una temporada
app.post('/api/temporadas', soloGerente, async (req, res) => {

  const { nombre, fechaInicio, fechaFin, porcentaje, diasAplicables } = req.body;
  const nueva = await prisma.temporada.create({

    data: { nombre, fechaInicio: new Date(fechaInicio), fechaFin: new Date(fechaFin), porcentaje: parseFloat(porcentaje), diasAplicables, hotelId: req.hotelId }

  });

  res.status(201).json(nueva);

});

// Ruta para eliminar una temporada
app.delete('/api/temporadas/:id', soloGerente, async (req, res) => {

  try {

    const resultado = await prisma.temporada.deleteMany({

      where: { id: parseInt(req.params.id), hotelId: req.hotelId }

    });

    if (resultado.count === 0) {
      return res.status(404).json({ error: 'Temporada no encontrada' });
    }

    res.json({ mensaje: 'Temporada eliminada' });

  } catch (error) {

    res.status(500).json({ error: 'Error al eliminar la temporada' });

  }

});

// === CONFIGURACIÓN ===
// Ruta para ACTUALIZAR DATOS DEL HOTEL (Con validación de contraseña)
app.put('/api/hotel', soloGerente, async (req, res) => {

  try {

    const { email, password, datosHotel } = req.body;

    // 1. Validar identidad del Gerente
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || usuario.hotelId !== req.hotelId) {

      return res.status(403).json({ error: 'Usuario no autorizado.' });

    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {

      return res.status(403).json({ error: 'Contraseña incorrecta. No se guardaron los cambios.' });

    }

    // 2. Actualizar el hotel
    const hotelActualizado = await prisma.hotel.update({

      where: { id: req.hotelId },
      data: {

        nombre: datosHotel.nombre,
        razonSocial: datosHotel.razonSocial,
        nit: datosHotel.nit,
        direccion: datosHotel.direccion,
        ciudad: datosHotel.ciudad,
        departamento: datosHotel.departamento,
        pais: datosHotel.pais,
        telefono: datosHotel.telefono

      }

    });

    res.json(hotelActualizado);

  } catch (error) {

    res.status(500).json({ error: 'Error al actualizar el hotel', detalle: error.message });

  }

});

// === INICIO DEL SERVIDOR ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));

