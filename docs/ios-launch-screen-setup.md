# iOS Launch Screen Setup

## Objectif
Afficher le logo "LEXU" centré sur fond noir au lancement de l'app iOS.

## Étapes

### 1. Ajouter l'image dans Assets.xcassets

1. Ouvrir Xcode
2. Naviguer vers `ios/App/App/Assets.xcassets`
3. Créer un nouvel Image Set nommé `LexuLaunch`
4. Ajouter l'image du logo LEXU (format PNG recommandé, @2x et @3x pour différentes résolutions)

### 2. Modifier LaunchScreen.storyboard

1. Ouvrir `ios/App/App/LaunchScreen.storyboard` dans Xcode
2. Supprimer les éléments existants (si nécessaire)
3. Ajouter un `UIImageView` :
   - Sélectionner le View Controller
   - Dans la bibliothèque d'objets (Object Library), chercher "Image View"
   - Glisser-déposer dans le View Controller
4. Configurer l'UIImageView :
   - Sélectionner l'image view
   - Dans l'inspecteur d'attributs (Attributes Inspector) :
     - Image : `LexuLaunch`
     - Content Mode : `Aspect Fit`
   - Dans l'inspecteur de contraintes (Size Inspector) :
     - Ajouter une contrainte "Center Horizontally in Container" (Center X)
     - Ajouter une contrainte "Center Vertically in Container" (Center Y)
     - Ajouter une contrainte "Width" avec relation "Less Than or Equal" et multiplier 0.7 (70% de la largeur)
     - Ajouter une contrainte "Aspect Ratio" 1:1 (ou selon le ratio de votre logo)

### 3. Configurer le fond noir

1. Sélectionner le View Controller principal
2. Dans l'inspecteur d'attributs :
   - Background : `Black Color` (ou couleur personnalisée #000000)

### 4. Vérification

- L'image doit être centrée horizontalement et verticalement
- L'image ne doit pas dépasser 70% de la largeur de l'écran
- Le fond doit être noir
- L'image doit garder son ratio d'aspect

## Alternative : Code XML (si vous préférez éditer directement)

Si vous préférez éditer le fichier XML directement, voici un exemple de structure :

```xml
<scene sceneID="EHf-IW-A2E">
    <objects>
        <viewController id="01J-lp-oVM" sceneMemberID="viewController">
            <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                <rect key="frame" x="0.0" y="0.0" width="414" height="896"/>
                <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                <subviews>
                    <imageView clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="LexuLaunch" translatesAutoresizingMaskIntoConstraints="NO" id="logo-image">
                        <rect key="frame" x="62.0" y="348.0" width="290" height="200"/>
                    </imageView>
                </subviews>
                <color key="backgroundColor" white="0.0" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
                <constraints>
                    <constraint firstItem="logo-image" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="centerX"/>
                    <constraint firstItem="logo-image" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="centerY"/>
                    <constraint firstItem="logo-image" firstAttribute="width" secondItem="Ze5-6b-2t3" secondAttribute="width" multiplier="0.7" relation="lessThanOrEqual" id="width"/>
                    <constraint firstItem="logo-image" firstAttribute="height" secondItem="logo-image" secondAttribute="width" multiplier="1:1" id="aspect"/>
                </constraints>
            </view>
        </viewController>
        <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
    </objects>
    <point key="canvasLocation" x="52" y="374.66266866566718"/>
</scene>
```

## Notes

- Le Launch Screen s'affiche immédiatement au démarrage de l'app
- Il est remplacé par l'intro in-app (`Intro.tsx`) une fois que l'app React est chargée
- Pour tester, build et run l'app sur un simulateur ou un appareil réel

