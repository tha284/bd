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
    user: 'root', // <<-- SUBSTITUA AQUI
    password: '', // <<-- SUBSTITUA AQUI
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
// ROTA PARA SALVAR ENTRADAS DE DIÁRIO
// =========================================================================
app.post('/diary/save', (req, res) => {
    const { userId, mood, entryText, imageUrl } = req.body;

    if (!userId || !mood || !entryText) {
        return res.status(400).json({ message: 'Dados incompletos para salvar a anotação.' });
    }

    const sql = 'INSERT INTO diary_entries (user_id, mood, entry_text, image_url) VALUES (?, ?, ?, ?)';
    db.query(sql, [userId, mood, entryText, imageUrl], (err, result) => {
        if (err) {
            console.error('Erro ao salvar anotação:', err);
            return res.status(500).json({ message: 'Erro interno ao salvar anotação.' });
        }
        res.status(201).json({ message: 'Anotação salva com sucesso!', entryId: result.insertId });
    });
});

// =========================================================================
// ROTA PARA BUSCAR ENTRADAS DE DIÁRIO
// =========================================================================
app.get('/diary/getEntries/:userId', (req, res) => {
    const { userId } = req.params;

    const sql = `SELECT id, entry_text, mood, image_url, created_at FROM diary_entries WHERE user_id = ? ORDER BY created_at DESC`;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar anotações:', err);
            return res.status(500).json({ message: 'Erro interno ao buscar anotações.' });
        }
        res.status(200).json(results);
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

// =========================================================================
// ROTA PARA BUSCAR DADOS DO USUÁRIO (NOVA ROTA)
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
// ROTA PARA ATUALIZAR DADOS DO USUÁRIO (NOVA ROTA)
// =========================================================================
app.put('/user/update/:userId', (req, res) => {
    const { userId } = req.params;
    const { username, email, password_hash, emergency_phone } = req.body;

    const updates = [];
    const values = [];

    if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        values.push(email);
    }
    if (password_hash !== undefined && password_hash !== '') {
        updates.push('password_hash = ?');
        values.push(password_hash);
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

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});