from flask import Flask, request, redirect
import hashlib
import MySQLdb

app = Flask(__name__)

# Register url
@app.route('/register', methods=['POST'])
def register():
    db = MySQLdb.connect(host="localhost", user="root", passwd="password", db="test")
    cursor = db.cursor()
    email = request.form['email']
    cursor.execute("INSERT INTO users (email) VALUES (" + email + ")")
    username = request.form['username']
    password = request.form['password']
    # Add username and password to database, or return exception
    try:
        # Hash the password
        