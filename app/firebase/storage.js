
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from "./firebaseConfig";

export const uploadImage = async (imageUri) => {
  try {
    // Convert URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    // Create a unique filename
    const filename = `images/${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const imageRef = ref(storage, filename);
    
    // Upload the blob
    await uploadBytes(imageRef, blob);
    
    // Get download URL
    const downloadUrl = await getDownloadURL(imageRef);
    console.log('Image uploaded successfully:', downloadUrl);
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};