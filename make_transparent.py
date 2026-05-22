from PIL import Image

# Load the original logo
input_path = "/home/luara/.gemini/antigravity/brain/b997e403-f62b-4514-b68f-1df416bb63aa/media__1779473882337.png"
output_path = "/home/luara/Documents/fiado/faido-mobile/apps/mobile/assets/icon.png"

img = Image.open(input_path).convert("L")  # Convert to grayscale to use as alpha mask

# Create a new fully white image of the same size
white_img = Image.new("RGBA", img.size, (255, 255, 255, 255))

# Put the grayscale image into the alpha channel of the white image
white_img.putalpha(img)

# Save the new transparent logo to all necessary paths
white_img.save("/home/luara/Documents/fiado/faido-mobile/apps/mobile/assets/icon.png", "PNG")
white_img.save("/home/luara/Documents/fiado/faido-mobile/apps/mobile/assets/adaptive-icon.png", "PNG")
white_img.save("/home/luara/Documents/fiado/faido-mobile/apps/mobile/assets/splash.png", "PNG")
white_img.save("/home/luara/Documents/fiado/faido-mobile/apps/mobile/assets/favicon.png", "PNG")

print("Logo processed successfully!")
