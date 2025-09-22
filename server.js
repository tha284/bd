const express = require('express');
const mysql = require('mysql');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// =========================================================================
// ATENÇÃO: Configuração do banco de dados MySQL
// =========================================================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'seu_usuario', // <<-- SUBSTITUA AQUI
    password: 'sua_senha', // <<-- SUBSTITUA AQUI
    database: 'MindCareApp'
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados MySQL:', err);
        return;
    }
    console.log('Conectado ao banco de dados MySQL.');
});

// =========================================================================
// ROTA PARA REGISTRO DE USUÁRIOS
// =========================================================================
app.post('/register', (req, res) => {
    const { username, email, password_hash, emergency_phone } = req.body;
    if (!username || !email || !password_hash) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });
    }

    const sql = `INSERT INTO users (username, email, password_hash, emergency_phone) VALUES (?, ?, ?, ?)`;

    db.query(sql, [username, email, password_hash, emergency_phone], function(err, result) {
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
});

// =========================================================================
// ROTA PARA LOGIN DE USUÁRIOS
// =========================================================================
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const sql = `SELECT id, username FROM users WHERE email = ? AND password_hash = ?`;
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error("Erro no login:", err.message);
            return res.status(500).json({ message: 'Erro no servidor.' });
        }
        if (results.length > 0) {
            const user = results[0];
            res.status(200).json({ message: 'Login realizado com sucesso!', userId: user.id, username: user.username });
        } else {
            res.status(401).json({ message: 'Email ou senha incorretos.' });
        }
    });
});


// =========================================================================
// ROTA PARA SALVAR ENTRADA DE HUMOR
// =========================================================================
app.post('/mood/save', (req, res) => {
    const { userId, moodType } = req.body;

    if (!userId || !moodType) {
        return res.status(400).json({ message: 'Dados incompletos para salvar o humor.' });
    }

    const sql = 'INSERT INTO mood_entries (user_id, mood_type) VALUES (?, ?)';
    db.query(sql, [userId, moodType], (err, result) => {
        if (err) {
            console.error('Erro ao salvar humor:', err);
            return res.status(500).json({ message: 'Erro interno ao salvar humor.' });
        }
        res.status(201).json({ message: 'Humor salvo com sucesso!', entryId: result.insertId });
    });
});

// =========================================================================
// ROTA PARA BUSCAR O RESUMO DE HUMOR PARA O RELATÓRIO
// =========================================================================
app.get('/mood/getReport/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = `
        SELECT mood_type, COUNT(*) as count
        FROM mood_entries
        WHERE user_id = ? AND created_at >= CURDATE() - INTERVAL 7 DAY
        GROUP BY mood_type
        ORDER BY count DESC;
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar resumo de humor:', err);
            return res.status(500).json({ message: 'Erro interno ao buscar resumo de humor.' });
        }
        res.status(200).json(results);
    });
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});