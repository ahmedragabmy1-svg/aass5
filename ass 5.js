//=====PART 1 ======
const { Sequelize} = require("sequelize");

const sequelize = new Sequelize("assignment5_db", "root", "", {
    host: "localhost",
    dialect: "mysql"
});

const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM("user", "admin"), defaultValue: "user" }
});

const Post = sequelize.define("Post", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false }
}, { paranoid: true });

const Comment = sequelize.define("Comment", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.TEXT, allowNull: false }
});

User.hasMany(Post, { foreignKey: "userId" });
Post.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Comment, { foreignKey: "userId" });
Comment.belongsTo(User, { foreignKey: "userId" });

Post.hasMany(Comment, { foreignKey: "postId" });
Comment.belongsTo(Post, { foreignKey: "postId" });

async function start() {
    try {
        await sequelize.authenticate();
        console.log("Database connected successfully");

        await sequelize.sync();
        console.log("Tables created successfully");

    } catch (error) {
        console.log(error);
    }
}

start();


//=====PART 2 ======
const express = require("express");
const { Op, fn, col } = require("sequelize");
const app = express();
app.use(express.json());

app.post("/users/signup", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const oldUser = await User.findOne({ where: { email } });
        if (oldUser) return res.status(400).json({ message: "Email already exists" });

        const user = await User.create({ name, email, password, role });
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put("/users/:id", async (req, res) => {
    try {
        const id = req.params.id;
        let user = await User.findByPk(id);

        if (user) {
            await user.update(req.body, { validate: false });
            return res.json({ message: "User updated", user });
        }

        user = await User.create({ id, ...req.body }, { validate: false });
        res.status(201).json({ message: "User created", user });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get("/users/by-email", async (req, res) => {
    try {
        const user = await User.findOne({ where: { email: req.query.email } });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/user/:id", async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, { attributes: { exclude: ["role"] } });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post("/posts", async (req, res) => {
    try {
        const post = await Post.create(req.body);
        res.status(201).json(post);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete("/posts/:postId", async (req, res) => {
    try {
        const post = await Post.findByPk(req.params.postId);
        if (!post) return res.status(404).json({ message: "Post not found" });
        if (post.userId != req.body.userId) return res.status(403).json({ message: "You cannot delete this post" });

        await post.destroy();
        res.json({ message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/posts/details", async (req, res) => {
    try {
        const posts = await Post.findAll({
            attributes: ["id", "title", "content", "userId"],
            include: [
                { model: User, attributes: ["id", "name", "email"] },
                { model: Comment, attributes: ["id", "content", "userId", "createdAt"] }
            ]
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/posts/comment-count", async (req, res) => {
    try {
        const posts = await Post.findAll({
            attributes: [
                "id",
                "title",
                [fn("COUNT", col("Comments.id")), "commentCount"]
            ],
            include: [{ model: Comment, attributes: [], required: false }],
            group: ["Post.id"]
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post("/comments", async (req, res) => {
    try {
        const comments = await Comment.bulkCreate(req.body.comments);
        res.status(201).json(comments);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.patch("/comments/:commentId", async (req, res) => {
    try {
        const comment = await Comment.findByPk(req.params.commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (comment.userId != req.body.userId) return res.status(403).json({ message: "You cannot edit this comment" });

        comment.content = req.body.content;
        await comment.save();
        res.json(comment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.post("/comments/find-or-create", async (req, res) => {
    try {
        const [comment, created] = await Comment.findOrCreate({
            where: { postId: req.body.postId, userId: req.body.userId, content: req.body.content },
            defaults: req.body
        });
        res.json({ created, comment });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get("/comments/search", async (req, res) => {
    try {
        const result = await Comment.findAndCountAll({
            where: { content: { [Op.like]: `%${req.query.word}%` } }
        });
        res.json({ count: result.count, comments: result.rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/posts/:postId/comments", async (req, res) => {
    try {
        const comments = await Comment.findAll({
            where: { postId: req.params.postId },
            order: [["createdAt", "DESC"]],
            limit: 3
        });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/comments/:id", async (req, res) => {
    try {
        const comment = await Comment.findByPk(req.params.id, {
            include: [
                { model: User, attributes: ["id", "name", "email"] },
                { model: Post, attributes: ["id", "title", "content"] }
            ]
        });
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        res.json(comment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log("Database connected");

        await sequelize.sync();
        console.log("Tables created");

        app.listen(3000, () => {
            console.log("Server running on port 3000");
        });
    } catch (error) {
        console.log(error);
    }
}

startServer();
// ==== Bonus=====
var removeElement = function(nums, val) {
    let k = 0;
    for (let i = 0; i < nums.length; i++) {
        if (nums[i] !== val) {
            nums[k] = nums[i];
            k++;
        }
    }
    return k;
};