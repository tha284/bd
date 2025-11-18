const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// 🚨 IP DA API ATUALIZADO (Ajuste para o seu IP real)
const HOST_IP = '172.28.144.1'; // <<<--- TROQUE ESTE IP PELO SEU IP LOCAL
const CONNECTION_HOST = '0.0.0.0'; 
const API_URL = `http://${HOST_IP}:${port}`;

// =========================================================================
// MIDDLEWARES GLOBAIS
// =========================================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =========================================================================
// CONFIGURAÇÃO DO MULTER E UPLOADS (MANTIDO PARA COMPATIBILIDADE)
// =========================================================================

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Pasta uploads criada:', uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos de imagem são permitidos!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 } 
});

// Serve arquivos estáticos da pasta uploads
app.use('/uploads', express.static(uploadsDir));

// =========================================================================
// CONEXÃO COM O BANCO DE DADOS MySQL
// =========================================================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'MindCareApp'
});

db.connect(err => {
    if (err) {
        console.error('❌ Erro FATAL ao conectar ao banco de dados MySQL:', err.message);
        return;
    }
    console.log('✅ Conectado ao banco de dados MySQL.');
});

// =========================================================================
// ROTAS DE AUTENTICAÇÃO
// =========================================================================

app.post('/register', async (req, res) => {
    const { username, email, password, emergencyPhone } = req.body;
    console.log('📝 Tentativa de registro:', { username, email, emergencyPhone });
    
    if (!username || !email || !password) return res.status(400).json({ message: 'Campos obrigatórios ausentes.' });
    try {
        const password_hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (username, email, password_hash, emergency_phone) VALUES (?, ?, ?, ?)';
        db.query(sql, [username, email, password_hash, emergencyPhone || null], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email já registrado.' });
                console.error('Erro no registro (MySQL):', err.message);
                return res.status(500).json({ message: 'Erro interno no servidor.' });
            }
            console.log('✅ Usuário registrado com sucesso! ID:', result.insertId);
            res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: result.insertId });
        });
    } catch (error) {
        console.error('Erro no hash da senha:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    console.log('🔐 Tentativa de login:', { email });
    
    const sql = 'SELECT id, username, password_hash FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error('Erro no login (MySQL):', err.message);
            return res.status(500).json({ message: 'Erro interno no servidor.' });
        }
        if (results.length === 0) return res.status(401).json({ message: 'Email ou senha incorretos.' });

        const user = results[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            console.log('✅ Login bem-sucedido para usuário:', user.username);
            res.status(200).json({ 
                message: 'Login bem-sucedido!', 
                userId: user.id, 
                username: user.username 
            });
        } else {
            res.status(401).json({ message: 'Email ou senha incorretos.' });
        }
    });
});

// =========================================================================
// ROTAS DO PERFIL DO USUÁRIO
// =========================================================================

app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;
  console.log('📋 Buscando dados do usuário ID:', userId);

  const sql = 'SELECT id, username, email, emergency_phone FROM users WHERE id = ?';
  
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ Erro ao buscar dados do usuário:', err.message);
      return res.status(500).json({ message: 'Erro interno ao buscar dados do usuário.', errorDetails: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const user = results[0];
    console.log('✅ Dados do usuário encontrados:', user);
    res.status(200).json({
      id: user.id,
      username: user.username,
      email: user.email,
      emergency_phone: user.emergency_phone
    });
  });
});

app.put('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { username, email, emergency_phone, password } = req.body;
  
  console.log('✏️ Tentativa de atualização do usuário ID:', userId);
  console.log('📦 Dados recebidos:', { username, email, emergency_phone, password: password ? '***' : 'não informada' });

  const checkUserSql = 'SELECT id FROM users WHERE id = ?';
  db.query(checkUserSql, [userId], async (err, results) => {
    if (err) {
      console.error('❌ Erro ao verificar usuário:', err.message);
      return res.status(500).json({ message: 'Erro interno do servidor.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    try {
      let updateSql, updateValues;

      if (password && password.trim() !== '') {
        console.log('🔄 Atualizando com nova senha');
        const password_hash = await bcrypt.hash(password, saltRounds);
        updateSql = 'UPDATE users SET username = ?, email = ?, emergency_phone = ?, password_hash = ? WHERE id = ?';
        updateValues = [username, email, emergency_phone, password_hash, userId];
      } else {
        console.log('🔄 Atualizando sem alterar senha');
        updateSql = 'UPDATE users SET username = ?, email = ?, emergency_phone = ? WHERE id = ?';
        updateValues = [username, email, emergency_phone, userId];
      }

      db.query(updateSql, updateValues, (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            console.error('❌ Email já em uso:', email);
            return res.status(409).json({ message: 'Email já está em uso por outro usuário.' });
          }
          console.error('❌ Erro ao atualizar usuário:', err.message);
          return res.status(500).json({ message: 'Erro interno ao atualizar usuário.', errorDetails: err.message });
        }

        console.log('✅ Usuário atualizado com sucesso! Linhas afetadas:', result.affectedRows);
        res.status(200).json({ message: 'Perfil atualizado com sucesso!' });
      });
    } catch (error) {
      console.error('❌ Erro no hash da senha:', error);
      res.status(500).json({ message: 'Erro interno do servidor.' });
    }
  });
});

// =========================================================================
// ROTA DO DIÁRIO (SALVANDO IMAGEM COMO BASE64 NO BANCO)
// =========================================================================

app.post('/api/diary/save', (req, res) => {
    console.log('💾 Recebendo requisição para salvar entrada...');
    
    const { user_id, text, mood_key, mood_name, mood_color, mood_icon, timestamp, image_base64 } = req.body;

    if (!user_id || !text || !mood_key) {
        return res.status(400).json({ message: 'Dados incompletos (user_id, text, mood_key são obrigatórios).' });
    }
    
    // Insere a entrada em diary_entries, incluindo a imagem como base64
    const insertEntrySql = `INSERT INTO diary_entries (user_id, entry_text, mood_key, mood_name, mood_color, mood_icon, image_filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    // ✅ AGORA: image_filename vai armazenar a string base64 da imagem
    const entryValues = [user_id, text, mood_key, mood_name, mood_color, mood_icon, image_base64, timestamp || new Date()];

    db.query(insertEntrySql, entryValues, (err, result) => {
        if (err) {
            console.error('❌ Erro ao salvar entrada em diary_entries:', err.message);
            return res.status(500).json({ message: 'Erro interno ao salvar entrada.', errorDetails: err.message });
        }

        const entryId = result.insertId;
        console.log(`✅ Entrada #${entryId} salva em diary_entries COM IMAGEM BASE64.`);
        
        // Se há imagem base64, log do tamanho para debug
        if (image_base64) {
            console.log(`📸 Imagem base64 salva - Tamanho: ${image_base64.length} caracteres`);
        }

        res.status(201).json({ 
            message: 'Anotação salva com sucesso!', 
            entryId: entryId,
            hasImage: !!image_base64
        });
    });
});

// =========================================================================
// ROTA PARA BUSCAR ENTRADAS DO DIÁRIO
// =========================================================================

app.get('/api/diary/:userId', (req, res) => {
    const { userId } = req.params;

    // Busca entradas incluindo image_filename (que agora é base64)
    const entriesSql = `SELECT id, entry_text AS text, mood_key, mood_name, mood_color, mood_icon, image_filename, created_at AS timestamp FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC`;

    db.query(entriesSql, [userId], (err, entries) => {
        if (err) {
            console.error('❌ Erro ao buscar entradas:', err.message);
            return res.status(500).json({ message: 'Erro interno ao buscar anotações.', errorDetails: err.message });
        }

        if (entries.length === 0) {
            return res.status(200).json([]);
        }

        // 2. Formata resultados - AGORA image_filename contém base64
        const formattedResults = entries.map(entry => ({
            id: entry.id,
            timestamp: entry.timestamp,
            text: entry.text,
            mood_key: entry.mood_key,
            mood_name: entry.mood_name,
            mood_color: entry.mood_color,
            mood_icon: entry.mood_icon,
            // ✅ AGORA: image_filename é a string base64 diretamente
            image: entry.image_filename ? `data:image/jpeg;base64,${entry.image_filename}` : null
        }));
    
        console.log(`✅ ${formattedResults.length} entradas encontradas para o usuário ID: ${userId}.`);
        res.status(200).json(formattedResults);
    });
});

// =========================================================================
// ROTA PARA BUSCAR EMOÇÕES RECENTES DO DIÁRIO (PARA HOMESCREEN)
// =========================================================================

app.get('/api/recent-moods/:userId', (req, res) => {
    const { userId } = req.params;
    console.log(`📊 Buscando emoções recentes para o usuário ID: ${userId}`);

    // Busca as últimas 5 entradas de humor ordenadas por data (mais recentes primeiro)
    const sql = `
        SELECT mood_key, mood_name, mood_color, mood_icon, created_at
        FROM diary_entries 
        WHERE user_id = ? 
        ORDER BY created_at DESC
        LIMIT 5
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('❌ Erro ao buscar emoções recentes:', err.message);
            return res.status(500).json({ 
                message: 'Erro interno ao buscar emoções recentes.', 
                errorDetails: err.message 
            });
        }

        console.log(`✅ ${results.length} emoções recentes encontradas para o usuário ID: ${userId}`);
        
        // Formata as datas para exibição amigável
        const formattedResults = results.map(entry => ({
            mood_key: entry.mood_key,
            mood_name: entry.mood_name,
            mood_color: entry.mood_color,
            mood_icon: entry.mood_icon,
            date: new Date(entry.created_at).toLocaleDateString('pt-BR'),
            timestamp: entry.created_at
        }));

        res.status(200).json(formattedResults);
    });
});

// =========================================================================
// ROTA PARA ESTATÍSTICAS DE EMOÇÕES (PARA GRÁFICOS NO HOMESCREEN)
// =========================================================================

app.get('/api/mood-stats/:userId', (req, res) => {
    const { userId } = req.params;
    console.log(`📈 Buscando estatísticas de humor para o usuário ID: ${userId}`);

    // Busca contagem de emoções por tipo para gráficos
    const sql = `
        SELECT 
            mood_key, 
            mood_name, 
            mood_color,
            COUNT(*) as count,
            MAX(created_at) as last_entry
        FROM diary_entries 
        WHERE user_id = ? 
        GROUP BY mood_key, mood_name, mood_color
        ORDER BY count DESC
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('❌ Erro ao buscar estatísticas de humor:', err.message);
            return res.status(500).json({ 
                message: 'Erro interno ao buscar estatísticas.', 
                errorDetails: err.message 
            });
        }

        console.log(`✅ Estatísticas encontradas: ${results.length} tipos de emoção.`);
        res.status(200).json(results);
    });
});

// =========================================================================
// ROTA PARA DADOS DO GRÁFICO (PARA HOMESCREEN)
// =========================================================================

app.get('/api/moods/:userId', (req, res) => {
    const { userId } = req.params;
    console.log(`📊 Buscando dados de humor para o usuário ID: ${userId}`);

    // Agrupa e conta todas as entradas de humor para o usuário
    const sql = `
        SELECT mood_key, COUNT(*) as count 
        FROM diary_entries 
        WHERE user_id = ? 
        GROUP BY mood_key
        ORDER BY count DESC
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('❌ Erro ao buscar dados de humor:', err.message);
            return res.status(500).json({ message: 'Erro interno ao buscar dados de humor.', errorDetails: err.message });
        }

        console.log(`✅ Dados de humor encontrados: ${results.length} moods distintos.`);
        res.status(200).json(results);
    });
});

// =========================================================================
// ROTA PARA EXCLUIR ENTRADA DO DIÁRIO
// =========================================================================

app.delete('/api/diary/entry/:entryId', (req, res) => {
    const { entryId } = req.params;
    console.log(`🗑️ Tentativa de exclusão da entrada ID: ${entryId}`);

    const sql = 'DELETE FROM diary_entries WHERE id = ?';
    
    db.query(sql, [entryId], (err, result) => {
        if (err) {
            console.error('❌ Erro ao excluir entrada:', err.message);
            return res.status(500).json({ 
                message: 'Erro interno ao excluir entrada.', 
                errorDetails: err.message 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Entrada não encontrada.' });
        }

        console.log(`✅ Entrada #${entryId} excluída com sucesso.`);
        res.status(200).json({ message: 'Entrada excluída com sucesso!' });
    });
});

// =========================================================================
// ROTA PARA ATUALIZAR ENTRADA DO DIÁRIO
// =========================================================================

app.put('/api/diary/entry/:entryId', (req, res) => {
    const { entryId } = req.params;
    const { text, mood_key, mood_name, mood_color, mood_icon, image_base64 } = req.body;

    console.log(`✏️ Tentativa de atualização da entrada ID: ${entryId}`);
    
    const sql = `
        UPDATE diary_entries 
        SET entry_text = ?, mood_key = ?, mood_name = ?, mood_color = ?, mood_icon = ?, image_filename = ?
        WHERE id = ?
    `;
    
    const values = [text, mood_key, mood_name, mood_color, mood_icon, image_base64, entryId];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('❌ Erro ao atualizar entrada:', err.message);
            return res.status(500).json({ 
                message: 'Erro interno ao atualizar entrada.', 
                errorDetails: err.message 
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Entrada não encontrada.' });
        }

        console.log(`✅ Entrada #${entryId} atualizada com sucesso.`);
        res.status(200).json({ message: 'Entrada atualizada com sucesso!' });
    });
});

// =========================================================================
// ROTA PARA BUSCAR UMA ENTRADA ESPECÍFICA
// =========================================================================

app.get('/api/diary/entry/:entryId', (req, res) => {
    const { entryId } = req.params;
    console.log(`🔍 Buscando entrada específica ID: ${entryId}`);

    const sql = `
        SELECT id, entry_text AS text, mood_key, mood_name, mood_color, mood_icon, image_filename, created_at AS timestamp
        FROM diary_entries 
        WHERE id = ?
    `;

    db.query(sql, [entryId], (err, results) => {
        if (err) {
            console.error('❌ Erro ao buscar entrada:', err.message);
            return res.status(500).json({ 
                message: 'Erro interno ao buscar entrada.', 
                errorDetails: err.message 
            });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Entrada não encontrada.' });
        }

        const entry = results[0];
        const formattedEntry = {
            id: entry.id,
            timestamp: entry.timestamp,
            text: entry.text,
            mood_key: entry.mood_key,
            mood_name: entry.mood_name,
            mood_color: entry.mood_color,
            mood_icon: entry.mood_icon,
            image: entry.image_filename ? `data:image/jpeg;base64,${entry.image_filename}` : null
        };

        console.log(`✅ Entrada #${entryId} encontrada.`);
        res.status(200).json(formattedEntry);
    });
});

// =========================================================================
// ROTA DE HEALTH CHECK
// =========================================================================

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Servidor está funcionando!',
        timestamp: new Date().toISOString(),
        database: 'Connected'
    });
});

// =========================================================================
// MIDDLEWARE DE ERRO GLOBAL
// =========================================================================

app.use((error, req, res, next) => {
    console.error('💥 Erro global capturado:', error.message);
    res.status(500).json({ 
        message: 'Erro interno do servidor.', 
        error: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado.'
    });
});

// =========================================================================
// MANIPULADOR DE ROTAS NÃO ENCONTRADAS
// =========================================================================

app.use('*', (req, res) => {
    res.status(404).json({ 
        message: 'Rota não encontrada.', 
        path: req.originalUrl 
    });
});

// =========================================================================
// INICIALIZAÇÃO DO SERVIDOR
// =========================================================================
app.listen(port, CONNECTION_HOST, () => {
    console.log(`=================================`);
    console.log(`✅ Servidor rodando em ${API_URL}`);
    console.log(`   (Escutando em ${CONNECTION_HOST}:${port})`);
    console.log(`=================================`);
    console.log(`📊 Rotas disponíveis:`);
    console.log(`   POST /register`);
    console.log(`   POST /login`);
    console.log(`   GET  /api/user/:userId`);
    console.log(`   PUT  /api/user/:userId`);
    console.log(`   POST /api/diary/save`);
    console.log(`   GET  /api/diary/:userId`);
    console.log(`   GET  /api/recent-moods/:userId`);
    console.log(`   GET  /api/mood-stats/:userId`);
    console.log(`   GET  /api/moods/:userId`);
    console.log(`   GET  /api/diary/entry/:entryId`);
    console.log(`   PUT  /api/diary/entry/:entryId`);
    console.log(`   DELETE /api/diary/entry/:entryId`);
    console.log(`   GET  /health`);
    console.log(`=================================`);
});