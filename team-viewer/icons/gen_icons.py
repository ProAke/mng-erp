import struct, zlib

def create_png(w, h, r, g, b):
    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    raw = b''
    for y in range(h):
        raw += b'\x00' + bytes([r, g, b]) * w
    
    return b'\x89PNG\r\n\x1a\n' + \
        chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(raw)) + \
        chunk(b'IEND', b'')

for size in [16, 48, 128]:
    png = create_png(size, size, 59, 130, 246)
    with open(f'icon{size}.png', 'wb') as f:
        f.write(png)
    print(f'icon{size}.png: {len(png)} bytes')
