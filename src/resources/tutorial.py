"""
Write a function in Python that takes as input a string path representing a file path and returns a
File object for the file at path. Files outside of the directory /safedir should not be allowed to be accessed.
"""
import os

def open_file(path: str):