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

// =========================================================================
// MIDDLEWARES GLOBAIS
// =========================================================================
app.use(cors());
// Aumentando o limite para lidar com uploads de base64 ou grandes payloads JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =========================================================================
// CONFIGURAÇÃO DO MULTER E UPLOADS
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
  limits: { fileSize: 1024 * 1024 * 10 } // Limite de 10MB
});

// Servir arquivos estáticos da pasta 'uploads'
app.use('/uploads', express.static(uploadsDir));

// =========================================================================
// ATENÇÃO: Configuração do banco de dados MySQL
// =========================================================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // <<-- SUBSTITUA AQUI
    password: '', // <<-- SUBSTITUA AQUI
    database: 'MindCareApp'
});

db.connect(err => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados MySQL:', err);
        return;
    }
    console.log('✅ Conectado ao banco de dados MySQL.');
});

// =========================================================================
// ROTA PARA REGISTRO DE USUÁRIOS
// =========================================================================
app.post('/register', async (req, res) => {
    const { username, email, password, emergency_phone } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Nome, email e senha são obrigatórios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const sql = `INSERT INTO users (username, email, password_hash, emergency_phone) VALUES (?, ?, ?, ?)`;

        db.query(sql, [username, email, hashedPassword, emergency_phone], function(err, result) {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    res.status(409).json({ message: 'Este email já está cadastrado.' });
                } else {
                    console.error("Erro no registro:", err.message);
                    res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
                }
                return;
            }
            res.status(201).json({ message: 'Usuário cadastrado com sucesso!', userId: result.insertId });
        });
    } catch (hashError) {
        console.error("Erro ao fazer hash da senha:", hashError);
        res.status(500).json({ message: 'Erro interno de processamento.' });
    }
});

// =========================================================================
// ROTA PARA LOGIN DE USUÁRIOS
// =========================================================================
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const sql = `SELECT id, username, password_hash FROM users WHERE email = ?`;
    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error("Erro no login:", err.message);
            return res.status(500).json({ message: 'Erro no servidor.' });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: 'Email ou senha incorretos.' });
        }
        
        const user = results[0];
        
        try {
            const match = await bcrypt.compare(password, user.password_hash);
            
            if (match) {
                res.status(200).json({ 
                    message: 'Login realizado com sucesso!', 
                    userId: user.id, 
                    username: user.username 
                });
            } else {
                res.status(401).json({ message: 'Email ou senha incorretos.' });
            }
        } catch (compareError) {
            console.error("Erro ao comparar senha:", compareError);
            res.status(500).json({ message: 'Erro interno de autenticação.' });
        }
    });
});


// =========================================================================
// ROTA PARA UPLOAD DE IMAGEM - ACEITA FORM DATA E BASE64
// =========================================================================
app.post('/diary/uploadImage', upload.single('image'), (req, res) => {
  try {
    console.log('🖼️  Recebendo upload de imagem...');
    
    // 1. Upload via FormData (feito pelo Multer)
    if (req.file) {
      console.log('📁 Upload via FormData detectado');
      // **AJUSTE O IP AQUI** se 172.17.16.1 não for o IP correto da sua máquina/servidor
      const imageUrl = `http://172.17.16.1:${port}/uploads/${req.file.filename}`;
      
      return res.status(200).json({
        success: true,
        message: 'Upload de imagem bem-sucedido',
        imageUrl: imageUrl,
        filename: req.file.filename
      });
    }
    
    // 2. Upload via JSON (base64)
    if (req.body.imageData && req.body.isBase64) {
      console.log('📸 Upload via base64 detectado (Web)');
      const { imageData, mimeType = 'image/jpeg', filename = `image_${Date.now()}.jpg` } = req.body;
      
      if (!imageData) {
        return res.status(400).json({
          success: false,
          message: 'Dados de imagem base64 não fornecidos.'
        });
      }

      try {
        const buffer = Buffer.from(imageData, 'base64');
        
        let extension = 'jpg';
        if (mimeType.includes('png')) extension = 'png';
        if (mimeType.includes('gif')) extension = 'gif';
        if (mimeType.includes('webp')) extension = 'webp';
        
        const finalFilename = `image_${Date.now()}_${Math.round(Math.random() * 1E3)}.${extension}`;
        const filePath = path.join(uploadsDir, finalFilename);
        
        fs.writeFileSync(filePath, buffer);
        console.log('✅ Imagem base64 salva como:', finalFilename);
        
        // **AJUSTE O IP AQUI** se 172.17.16.1 não for o IP correto da sua máquina/servidor
        const imageUrl = `http://172.17.16.1:${port}/uploads/${finalFilename}`;
        
        return res.status(200).json({
          success: true,
          message: 'Upload de imagem bem-sucedido (base64)',
          imageUrl: imageUrl,
          filename: finalFilename
        });
        
      } catch (bufferError) {
        console.error('💥 Erro ao processar base64:', bufferError);
        return res.status(400).json({
          success: false,
          message: 'Erro ao processar dados base64: ' + bufferError.message
        });
      }
    }

    console.log('❌ Nenhum método de upload detectado');
    return res.status(400).json({
      success: false,
      message: 'Nenhuma imagem enviada. Use FormData com campo "image" ou JSON com "imageData".'
    });

  } catch (error) {
    console.error('💥 Erro no upload de imagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no servidor durante o upload: ' + error.message
    });
  }
});

// =========================================================================
// ROTA PARA SALVAR ENTRADAS DE DIÁRIO (Tabela: diary_entries)
// =========================================================================
app.post('/diary/save', (req, res) => {
    console.log('💾 Recebendo requisição para salvar entrada:', req.body);
    const { userId, mood, entryText, imageUrl } = req.body;

    if (!userId || !mood || !entryText) {
        return res.status(400).json({ message: 'Dados incompletos para salvar a anotação.' });
    }

    const sql = 'INSERT INTO diary_entries (user_id, mood, entry_text, image_url) VALUES (?, ?, ?, ?)';
    const values = [userId, mood, entryText, imageUrl || null];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Erro ao salvar anotação do diário:', err);
            return res.status(500).json({ message: 'Erro interno ao salvar anotação.' });
        }
        res.status(201).json({ message: 'Anotação salva com sucesso!', entryId: result.insertId });
    });
});

// =========================================================================
// ROTA PARA BUSCAR ENTRADAS DE DIÁRIO (Tabela: diary_entries)
// =========================================================================
app.get('/diary/getEntries/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = `SELECT id, entry_text, mood, image_url, created_at FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC`;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar anotações do diário:', err);
            return res.status(500).json({ message: 'Erro interno ao buscar anotações.' });
        }
        res.status(200).json(results);
    });
});


// =========================================================================
// ROTA PARA CHECAR REGISTRO DE HUMOR DIÁRIO (Tabela: mood_entries)
// =========================================================================
app.get('/mood/hasRegisteredToday/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = `
        SELECT 1 
        FROM mood_entries 
        WHERE user_id = ? AND DATE(created_at) = CURDATE()
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao checar registro diário de humor:', err);
            return res.status(500).json({ registered: false, message: 'Erro interno do servidor.' });
        }
        
        res.status(200).json({ registered: results.length > 0 });
    });
});


// =========================================================================
// ROTA PARA SALVAR ENTRADA DE HUMOR (Tabela: mood_entries, com limite diário)
// =========================================================================
app.post('/mood/save', (req, res) => {
    const { userId, moodType } = req.body;

    if (!userId || !moodType) {
        return res.status(400).json({ message: 'Dados incompletos para salvar o humor.' });
    }

    // 1. Checa se já registrou hoje
    const checkSql = `
        SELECT id 
        FROM mood_entries 
        WHERE user_id = ? AND DATE(created_at) = CURDATE()
    `;

    db.query(checkSql, [userId], (err, checkResults) => {
        if (err) {
            console.error('Erro na checagem diária de humor:', err);
            return res.status(500).json({ message: 'Erro interno ao verificar registro diário.' });
        }

        if (checkResults.length > 0) {
            return res.status(409).json({ message: 'Você já registrou seu humor hoje. Volte amanhã!' });
        }

        // 2. Se não registrou, insere o novo humor
        const insertSql = 'INSERT INTO mood_entries (user_id, mood_type) VALUES (?, ?)';
        db.query(insertSql, [userId, moodType], (insertErr, result) => {
            if (insertErr) {
                console.error('Erro ao salvar humor:', insertErr);
                return res.status(500).json({ message: 'Erro interno ao salvar humor.' });
            }
            res.status(201).json({ message: 'Humor salvo com sucesso!', entryId: result.insertId });
        });
    });
});

// =========================================================================
// ROTA PARA BUSCAR O RESUMO DE HUMOR (Tabela: mood_entries)
// =========================================================================
app.get('/mood/getReport/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = `
        SELECT mood_type, COUNT(*) as count 
        FROM mood_entries 
        WHERE user_id = ? AND created_at >= CURDATE() - INTERVAL 7 DAY 
        GROUP BY mood_type 
        ORDER BY count DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar resumo de humor:', err);
            return res.status(500).json({ message: 'Erro interno ao buscar resumo de humor.' });
        }
        res.status(200).json(results);
    });
});

// =========================================================================
// ROTA PARA BUSCAR DADOS DO USUÁRIO
// =========================================================================
app.get('/user/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = 'SELECT username, email, emergency_phone FROM users WHERE id = ?';
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar dados do usuário:', err);
            return res.status(500).json({ message: 'Erro interno ao buscar dados.' });
        }
        if (results.length > 0) {
            res.status(200).json(results[0]);
        } else {
            res.status(404).json({ message: 'Usuário não encontrado.' });
        }
    });
});


// =========================================================================
// ROTA PARA ATUALIZAR DADOS DO USUÁRIO
// =========================================================================
app.put('/user/update/:userId', (req, res) => {
    const { userId } = req.params;
    const { username, email, password, emergency_phone } = req.body;

    const updates = [];
    const values = [];

    // Lógica para hashing da nova senha, se fornecida
    let hashedPassword = null;
    if (password !== undefined && password !== '') {
        try {
            // Usa sync para simplificar o PUT, já que a operação é rápida
            hashedPassword = bcrypt.hashSync(password, saltRounds);
            updates.push('password_hash = ?');
            values.push(hashedPassword);
        } catch(e) {
            console.error('Erro ao hashear senha para atualização:', e);
            return res.status(500).json({ message: 'Erro interno ao processar a senha.' });
        }
    }
    
    if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        values.push(email);
    }
    if (emergency_phone !== undefined) {
        updates.push('emergency_phone = ?');
        values.push(emergency_phone);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
    }

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    values.push(userId);

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Erro ao atualizar dados do usuário:', err);
            return res.status(500).json({ message: 'Erro interno ao atualizar dados.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.status(200).json({ message: 'Dados atualizados com sucesso.' });
    });
});

// =========================================================================
// ROTA DE SAÚDE DO SERVIDOR
// =========================================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Servidor está funcionando!',
    timestamp: new Date().toISOString()
  });
});


// =========================================================================
// INICIALIZAÇÃO DO SERVIDOR
// =========================================================================
app.listen(port, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`📁 Pasta de uploads: ${uploadsDir}`);
  console.log(`🔍 Health check: http://localhost:${port}/health`);
  console.log(`=================================`);
});