-- Base de datos de TESTS separada de la de desarrollo/despliegue:
-- sin ella, los workers del contenedor desplegado compiten con los de la suite
CREATE DATABASE edp_test;
