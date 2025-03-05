import sys

def read_and_print_files(filenames):
    print("I have the following code context:")
    for filename in filenames:
        try:
            with open(filename, 'r', encoding='utf-8') as file:
                print(f"__{filename}__")
                print()
                print("```")
                print(file.read())
                print("```")
                print("\n")  # Separate files with a newline
        except Exception as e:
            print(f"Error reading {filename}: {e}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <file1> <file2> ...", file=sys.stderr)
        sys.exit(1)
    
    read_and_print_files(sys.argv[1:])
