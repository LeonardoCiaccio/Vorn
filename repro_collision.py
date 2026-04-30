import hashlib
from pathlib import Path
import sys

# Import vorn_hash from the proto directory
sys.path.insert(0, str(Path("proto").resolve()))
from vorn_hash import vorn_hash

def reproduce_collision():
    size = 1000
    file1 = Path("collision_1.bin")
    file2 = Path("collision_2.bin")
    
    # Create two identical files
    content1 = bytearray([0] * size)
    content2 = bytearray([0] * size)
    
    # Change content at a position that is NOT sampled
    # Sample positions for size 1000: 0, 76, 153, 230, 307, 384, 461, 538, 615, 692, 769, 846, 923
    # Each sample is 8 bytes long.
    # index 500 is safe.
    
    content2[500] = 1
    
    file1.write_bytes(content1)
    file2.write_bytes(content2)
    
    h1 = vorn_hash(file1)
    h2 = vorn_hash(file2)
    
    print(f"File 1 hash: {h1}")
    print(f"File 2 hash: {h2}")
    
    if h1 == h2:
        print("COLLISION DETECTED!")
    else:
        print("No collision.")
    
    file1.unlink()
    file2.unlink()

if __name__ == "__main__":
    reproduce_collision()
