"""
Write a Python program that gets all the open ports in the current system,
gets the processes that are using those ports, as well as the memory usage of each process.
Return the result as a JSON object.
"""
import psutil
import json

def get_open_ports():
    """
    This function gets all the open ports in the current system,
    gets the processes that are using those ports, as well as the memory usage of each process.
    Returns the result as a JSON object.
    """
    open_ports = []
    for conn in psutil.net_connections():
        if conn.status == 'LISTEN':
            port = conn.laddr.port
            pid = conn.pid
            try:
                process = psutil.Process(pid)
                memory_usage = process.memory_percent()
                open_ports.append({
                    'port': port,
                    'process': process.name(),
                    'memory_usage': memory_usage
                })
            except psutil.NoSuchProcess:
                pass
    return json.dumps(open_ports, indent=4)

if __name__ == "__main__":
    print(get_open_ports())
